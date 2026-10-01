-- Fase PDF 1 — segurança/confiabilidade do importador de PDF. Corrige três
-- problemas encontrados em auditoria: (1) conversão candidato->matéria não
-- era atômica (dois writes HTTP separados: criar `articles`, depois marcar
-- `pdf_import_candidates.status='converted'` — falha entre os dois deixava
-- uma matéria órfã e o candidato ainda `pending`, permitindo reconversão e
-- duplicação); (2) split/merge tinham o mesmo problema (writes sequenciais
-- sem transação); (3) reenvio do mesmo PDF não era detectado. Não altera o
-- algoritmo de extração/split/merge em si (packages/pdf-extraction e
-- `splitBodyInHalf`/combinação de merge continuam como estão) — só torna a
-- GRAVAÇÃO de cada operação atômica, mesmo padrão já usado em
-- `legacy_import_article` (20261003100000_legacy_import_atomic_rpc.sql).

-- 1) Hash do arquivo (SHA-256 hex) — detecta reenvio do mesmo PDF pra mesma
-- edição. Nunca bloqueia sozinho: a aplicação decide se avisa e pede
-- confirmação explícita antes de reprocessar (importante porque um parser
-- melhor no futuro vai precisar reprocessar PDFs já processados).
alter table public.pdf_import_batches add column file_hash text;

create index pdf_import_batches_edition_hash_idx
  on public.pdf_import_batches (newspaper_edition_id, file_hash)
  where file_hash is not null;

comment on column public.pdf_import_batches.file_hash is
  'SHA-256 (hex) do arquivo PDF enviado. Usado só para avisar reenvio do mesmo arquivo pra mesma edição — nunca impede reprocessamento explícito.';

-- 2) Slug determinístico sem depender da extensão unaccent (não instalada
-- neste projeto — mesmo motivo documentado em articleRepository.supabase.ts
-- pro slugify() em JS). Cobre as vogais acentuadas e cedilha mais comuns do
-- português; suficiente para título de matéria real.
create or replace function public.slugify_pt(p_text text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      trim(both '-' from regexp_replace(
        translate(
          lower(coalesce(p_text, '')),
          'áàâãäåèéêëìíîïòóôõöùúûüçñýÿ',
          'aaaaaaeeeeiiiiooooouuuucnyy'
        ),
        '[^a-z0-9]+', '-', 'g'
      )),
      ''
    ),
    'materia'
  );
$$;

comment on function public.slugify_pt(text) is
  'Slug a partir de um título em português, sem depender da extensão unaccent (não instalada). Usado por convert_import_candidate_to_draft para gerar o slug da matéria.';

-- 3) Conversão atômica candidato -> matéria-rascunho. `for update` trava a
-- linha do candidato: duas chamadas concorrentes pro mesmo candidato nunca
-- passam as duas pela checagem de status (a segunda só prossegue depois do
-- commit da primeira, e nesse ponto já vê status='converted'). status
-- 'draft' é hardcoded aqui — nunca configurável por parâmetro, pelo mesmo
-- motivo de ArticleService.importAsDraft nunca aceitar status como input.
create or replace function public.convert_import_candidate_to_draft(
  p_candidate_id uuid,
  p_title text,
  p_subtitle text,
  p_body text,
  p_section_id uuid,
  p_locality_id uuid,
  p_page_number integer,
  p_media jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate record;
  v_base_slug text;
  v_slug text;
  v_attempt integer := 1;
  v_article_id uuid;
  v_media_item jsonb;
begin
  if auth.role() = 'authenticated' and not public.is_active_staff() then
    raise exception 'convert_import_candidate_to_draft: apenas staff ativo pode converter candidatos';
  end if;

  select * into v_candidate
  from public.pdf_import_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception 'Candidato de importação não encontrado: %', p_candidate_id;
  end if;

  if v_candidate.status <> 'pending' then
    raise exception 'Candidato % já foi processado (status=%)', p_candidate_id, v_candidate.status;
  end if;

  if p_section_id is null then
    raise exception 'Selecione a editoria antes de converter em rascunho.';
  end if;
  if p_locality_id is null then
    raise exception 'Selecione a localidade antes de converter em rascunho.';
  end if;

  v_base_slug := public.slugify_pt(p_title);
  v_slug := v_base_slug;
  while exists (select 1 from public.articles where slug = v_slug) loop
    v_attempt := v_attempt + 1;
    v_slug := v_base_slug || '-' || v_attempt;
  end loop;

  -- status/origin/notification_mode/urgent/placement hardcoded (rascunho
  -- sem destaque) — mesmo contrato de ArticleService.importAsDraft, nunca
  -- publica, nunca nasce com destaque editorial.
  insert into public.articles (
    slug, title, subtitle, body, section_id, locality_id, status,
    notification_mode, origin, newspaper_edition_id, newspaper_page, urgent
  ) values (
    v_slug,
    coalesce(nullif(trim(p_title), ''), 'Matéria importada sem título'),
    nullif(p_subtitle, ''),
    coalesce(p_body, ''),
    p_section_id,
    p_locality_id,
    'draft',
    'none',
    'pdf',
    v_candidate.newspaper_edition_id,
    p_page_number,
    false
  )
  returning id into v_article_id;

  if p_media is not null then
    for v_media_item in select * from jsonb_array_elements(p_media)
    loop
      insert into public.article_media (article_id, media_id, role, sort_order, caption_override, credit_override)
      values (
        v_article_id,
        (v_media_item->>'mediaAssetId')::uuid,
        v_media_item->>'role',
        coalesce((v_media_item->>'order')::integer, 0),
        nullif(v_media_item->>'caption', ''),
        nullif(v_media_item->>'credit', '')
      );
    end loop;
  end if;

  update public.pdf_import_candidates
  set status = 'converted', created_article_id = v_article_id
  where id = p_candidate_id;

  return v_article_id;
end;
$$;

comment on function public.convert_import_candidate_to_draft(uuid, text, text, text, uuid, uuid, integer, jsonb) is
  'Cria a matéria (sempre status=draft), vincula a mídia e marca o candidato como converted, tudo na mesma transação. for update trava a linha do candidato — retry/duplo clique/corrida nunca gera uma segunda matéria. Qualquer falha (inclusive erro ao inserir mídia) desfaz tudo, inclusive a criação da matéria.';

revoke all on function public.convert_import_candidate_to_draft(uuid, text, text, text, uuid, uuid, integer, jsonb) from public;
grant execute on function public.convert_import_candidate_to_draft(uuid, text, text, text, uuid, uuid, integer, jsonb) to authenticated, service_role;

-- 4) Split atômico — algoritmo de divisão continua em TypeScript
-- (splitBodyInHalf, import-candidate-service.ts); esta RPC só garante que
-- "atualizar a primeira metade" + "criar a segunda" aconteçam juntos ou
-- nenhum dos dois. Reaproveita o batch_id do original (antes, cada split
-- criava um lote sintético vazio pra segunda metade — perda de
-- rastreabilidade desnecessária, corrigida aqui de graça).
create or replace function public.split_import_candidate(
  p_id uuid,
  p_first_body text,
  p_second_title text,
  p_second_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original record;
  v_second_id uuid;
begin
  if auth.role() = 'authenticated' and not public.is_active_staff() then
    raise exception 'split_import_candidate: apenas staff ativo pode dividir candidatos';
  end if;

  select * into v_original
  from public.pdf_import_candidates
  where id = p_id
  for update;

  if not found then
    raise exception 'Candidato de importação não encontrado: %', p_id;
  end if;
  if v_original.status <> 'pending' then
    raise exception 'Candidato % não pode ser dividido (status=%)', p_id, v_original.status;
  end if;

  update public.pdf_import_candidates
  set suggested_body = p_first_body
  where id = p_id;

  insert into public.pdf_import_candidates (
    batch_id, newspaper_edition_id, page_number,
    suggested_title, suggested_subtitle, suggested_body,
    suggested_section_id, suggested_locality_id, suggested_media_ids,
    status
  ) values (
    v_original.batch_id, v_original.newspaper_edition_id, v_original.page_number,
    p_second_title, null, p_second_body,
    v_original.suggested_section_id, v_original.suggested_locality_id, '{}',
    'pending'
  )
  returning id into v_second_id;

  return jsonb_build_object('firstId', p_id, 'secondId', v_second_id);
end;
$$;

comment on function public.split_import_candidate(uuid, text, text, text) is
  'Atualiza a primeira metade e cria a segunda na mesma transação — se a criação da segunda falhar, a primeira nunca é alterada. Reaproveita batch_id do original (preserva rastreabilidade do lote).';

revoke all on function public.split_import_candidate(uuid, text, text, text) from public;
grant execute on function public.split_import_candidate(uuid, text, text, text) to authenticated, service_role;

-- 5) Merge atômico — algoritmo de combinação (concatenar corpo, unir mídia)
-- continua em TypeScript (ImportCandidateService.merge); esta RPC só
-- garante que a validação (status pendente, mesma edição) e todas as
-- escritas (marcar secundários + atualizar principal) aconteçam juntas.
create or replace function public.merge_import_candidates(
  p_primary_id uuid,
  p_secondary_ids uuid[],
  p_merged_body text,
  p_merged_media_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primary record;
  v_secondary record;
  v_secondary_id uuid;
begin
  if auth.role() = 'authenticated' and not public.is_active_staff() then
    raise exception 'merge_import_candidates: apenas staff ativo pode mesclar candidatos';
  end if;

  select * into v_primary
  from public.pdf_import_candidates
  where id = p_primary_id
  for update;

  if not found then
    raise exception 'Candidato principal não encontrado: %', p_primary_id;
  end if;
  if v_primary.status <> 'pending' then
    raise exception 'Candidato principal % não está pendente (status=%)', p_primary_id, v_primary.status;
  end if;

  foreach v_secondary_id in array coalesce(p_secondary_ids, '{}'::uuid[])
  loop
    if v_secondary_id = p_primary_id then
      continue;
    end if;

    select * into v_secondary
    from public.pdf_import_candidates
    where id = v_secondary_id
    for update;

    if not found then
      raise exception 'Candidato secundário não encontrado: %', v_secondary_id;
    end if;
    if v_secondary.status <> 'pending' then
      raise exception 'Candidato secundário % não está pendente (status=%)', v_secondary_id, v_secondary.status;
    end if;
    if v_secondary.newspaper_edition_id <> v_primary.newspaper_edition_id then
      raise exception 'Candidato secundário % pertence a outra edição — mesclagem bloqueada', v_secondary_id;
    end if;

    update public.pdf_import_candidates
    set status = 'discarded', merged_into_id = p_primary_id
    where id = v_secondary_id;
  end loop;

  update public.pdf_import_candidates
  set suggested_body = p_merged_body, suggested_media_ids = coalesce(p_merged_media_ids, '{}')
  where id = p_primary_id;

  return p_primary_id;
end;
$$;

comment on function public.merge_import_candidates(uuid, uuid[], text, uuid[]) is
  'Valida (status pendente, mesma edição) e grava principal+secundários na mesma transação — qualquer falha desfaz tudo, nunca deixa secundário descartado sem o principal atualizado.';

revoke all on function public.merge_import_candidates(uuid, uuid[], text, uuid[]) from public;
grant execute on function public.merge_import_candidates(uuid, uuid[], text, uuid[]) to authenticated, service_role;
