-- PDF import: permissions on SECURITY DEFINER functions and duplicate-safe batches.
-- Every function remains transactional and preserves the original parsing data.
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
  if auth.role() = 'authenticated'
     and not coalesce(public.staff_can_module_action('editorial','materias_criar'),false) then
    raise exception 'Sem permissão para esta operação de importação PDF.' using errcode='42501';
  end if;
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
  if auth.role() = 'authenticated'
     and not coalesce(public.staff_can_module_action('editorial','materias_editar'),false) then
    raise exception 'Sem permissão para esta operação de importação PDF.' using errcode='42501';
  end if;
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

  -- Só os campos de CONTEXTO (lote/edição/página/editoria sugerida) são
  -- herdados — nunca source_blocks/extraction_method/etc, porque a segunda
  -- metade não é uma extração real daquela posição no PDF, é um corte
  -- manual do texto. split_from_id é quem preserva a linhagem de verdade.
  insert into public.pdf_import_candidates (
    batch_id, newspaper_edition_id, page_number,
    suggested_title, suggested_subtitle, suggested_body,
    suggested_section_id, suggested_locality_id, suggested_media_ids,
    status, split_from_id
  ) values (
    v_original.batch_id, v_original.newspaper_edition_id, v_original.page_number,
    p_second_title, null, p_second_body,
    v_original.suggested_section_id, v_original.suggested_locality_id, '{}',
    'pending', p_id
  )
  returning id into v_second_id;

  return jsonb_build_object('firstId', p_id, 'secondId', v_second_id);
end;
$$;

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
  if auth.role() = 'authenticated'
     and not coalesce(public.staff_can_module_action('editorial','materias_editar'),false) then
    raise exception 'Sem permissão para esta operação de importação PDF.' using errcode='42501';
  end if;
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
    -- Reprocessar o mesmo PDF gera um lote novo pra mesma edição (mesmo
    -- newspaper_edition_id) — sem esta checagem, dois candidatos de lotes
    -- diferentes (ex.: lote A e lote B, ambos da edição 771) passariam na
    -- validação de edição mas nunca deveriam ser mesclados entre si.
    if v_secondary.batch_id <> v_primary.batch_id then
      raise exception 'Candidato secundário % pertence a outro lote de importação — mesclagem só é permitida dentro do mesmo lote', v_secondary_id;
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

create or replace function public.create_pdf_import_batch(
  p_newspaper_edition_id uuid,
  p_source_file_name text,
  p_file_hash text,
  p_page_count integer,
  p_pages_without_text integer[],
  p_warnings jsonb,
  p_candidates jsonb,
  p_force boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_rows jsonb;
begin
  if auth.role() = 'authenticated'
     and not coalesce(public.staff_can_module_action('editorial','edicoes_gerenciar'),false) then
    raise exception 'Sem permissão para esta operação de importação PDF.' using errcode='42501';
  end if;
  if auth.role() = 'authenticated' and not public.is_active_staff() then
    raise exception 'create_pdf_import_batch: apenas staff ativo pode criar lotes de importação';
  end if;

  if p_file_hash is not null then
    if p_file_hash !~ '^[A-Fa-f0-9]{64}
    newspaper_edition_id, source_file_name, file_hash, page_count, pages_without_text, warnings
  ) values (
    p_newspaper_edition_id,
    p_source_file_name,
    p_file_hash,
    p_page_count,
    coalesce(p_pages_without_text, '{}'::integer[]),
    coalesce(p_warnings, '[]'::jsonb)
  )
  returning id into v_batch_id;

  if p_candidates is not null and jsonb_array_length(p_candidates) > 0 then
    with inserted as (
      insert into public.pdf_import_candidates (
        batch_id, newspaper_edition_id, page_number,
        suggested_title, suggested_subtitle, suggested_body,
        suggested_section_id, suggested_locality_id, suggested_media_ids,
        extraction_method, extraction_warnings, low_confidence_title,
        possible_continuation, possible_advertisement, page_coverage,
        source_blocks, page_width, page_height, status
      )
      -- newspaper_edition_id e status NUNCA vêm do jsonb do cliente — esta
      -- função é security definer, então um payload malicioso/malformado
      -- não pode colocar um candidato em outra edição nem nascer com um
      -- status diferente de 'pending' (ex.: 'converted' direto, pulando
      -- toda a barreira de revisão). Os dois são sempre os literais
      -- correspondentes ao parâmetro/estado inicial — qualquer valor em
      -- c->>'newspaper_edition_id' ou c->>'status' é ignorado.
      select
        v_batch_id,
        p_newspaper_edition_id,
        nullif(c->>'page_number', '')::integer,
        c->>'suggested_title',
        c->>'suggested_subtitle',
        c->>'suggested_body',
        nullif(c->>'suggested_section_id', '')::uuid,
        nullif(c->>'suggested_locality_id', '')::uuid,
        coalesce(
          (select array_agg(elem)::uuid[] from jsonb_array_elements_text(coalesce(c->'suggested_media_ids', '[]'::jsonb)) elem),
          '{}'::uuid[]
        ),
        nullif(c->>'extraction_method', ''),
        coalesce(c->'extraction_warnings', '[]'::jsonb),
        coalesce((c->>'low_confidence_title')::boolean, false),
        coalesce((c->>'possible_continuation')::boolean, false),
        coalesce((c->>'possible_advertisement')::boolean, false),
        c->'page_coverage',
        coalesce(c->'source_blocks', '[]'::jsonb),
        nullif(c->>'page_width', '')::numeric,
        nullif(c->>'page_height', '')::numeric,
        'pending'
      from jsonb_array_elements(p_candidates) as c
      returning *
    )
    select jsonb_agg(to_jsonb(inserted) order by inserted.created_at) into v_rows from inserted;
  end if;

  return coalesce(v_rows, '[]'::jsonb);
end;
$$; then
      raise exception 'Hash do PDF inválido.' using errcode='22023';
    end if;
    -- Lock por edição+hash impede dois HTTP requests concorrentes de
    -- criar lotes idênticos após ambos terem passado o pré-check.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_newspaper_edition_id::text||':'||lower(p_file_hash),0)
    );
    if not coalesce(p_force,false) and exists (
      select 1 from public.pdf_import_batches b
      where b.newspaper_edition_id=p_newspaper_edition_id
        and lower(b.file_hash)=lower(p_file_hash)
        and exists(select 1 from public.pdf_import_candidates c where c.batch_id=b.id)
    ) then
      raise exception 'Este PDF já foi importado nesta edição. Escolha Reprocessar mesmo assim.'
        using errcode='23505';
    end if;
  end if;

  insert into public.pdf_import_batches (
    newspaper_edition_id, source_file_name, file_hash, page_count, pages_without_text, warnings
  ) values (
    p_newspaper_edition_id,
    p_source_file_name,
    p_file_hash,
    p_page_count,
    coalesce(p_pages_without_text, '{}'::integer[]),
    coalesce(p_warnings, '[]'::jsonb)
  )
  returning id into v_batch_id;

  if p_candidates is not null and jsonb_array_length(p_candidates) > 0 then
    with inserted as (
      insert into public.pdf_import_candidates (
        batch_id, newspaper_edition_id, page_number,
        suggested_title, suggested_subtitle, suggested_body,
        suggested_section_id, suggested_locality_id, suggested_media_ids,
        extraction_method, extraction_warnings, low_confidence_title,
        possible_continuation, possible_advertisement, page_coverage,
        source_blocks, page_width, page_height, status
      )
      -- newspaper_edition_id e status NUNCA vêm do jsonb do cliente — esta
      -- função é security definer, então um payload malicioso/malformado
      -- não pode colocar um candidato em outra edição nem nascer com um
      -- status diferente de 'pending' (ex.: 'converted' direto, pulando
      -- toda a barreira de revisão). Os dois são sempre os literais
      -- correspondentes ao parâmetro/estado inicial — qualquer valor em
      -- c->>'newspaper_edition_id' ou c->>'status' é ignorado.
      select
        v_batch_id,
        p_newspaper_edition_id,
        nullif(c->>'page_number', '')::integer,
        c->>'suggested_title',
        c->>'suggested_subtitle',
        c->>'suggested_body',
        nullif(c->>'suggested_section_id', '')::uuid,
        nullif(c->>'suggested_locality_id', '')::uuid,
        coalesce(
          (select array_agg(elem)::uuid[] from jsonb_array_elements_text(coalesce(c->'suggested_media_ids', '[]'::jsonb)) elem),
          '{}'::uuid[]
        ),
        nullif(c->>'extraction_method', ''),
        coalesce(c->'extraction_warnings', '[]'::jsonb),
        coalesce((c->>'low_confidence_title')::boolean, false),
        coalesce((c->>'possible_continuation')::boolean, false),
        coalesce((c->>'possible_advertisement')::boolean, false),
        c->'page_coverage',
        coalesce(c->'source_blocks', '[]'::jsonb),
        nullif(c->>'page_width', '')::numeric,
        nullif(c->>'page_height', '')::numeric,
        'pending'
      from jsonb_array_elements(p_candidates) as c
      returning *
    )
    select jsonb_agg(to_jsonb(inserted) order by inserted.created_at) into v_rows from inserted;
  end if;

  return coalesce(v_rows, '[]'::jsonb);
end;
$$;

create or replace function public.create_pdf_import_batch(
 p_newspaper_edition_id uuid,p_source_file_name text,p_file_hash text,
 p_page_count integer,p_pages_without_text integer[],p_warnings jsonb,p_candidates jsonb
) returns jsonb language plpgsql security definer set search_path=public as $wrapper$
begin
 return public.create_pdf_import_batch(p_newspaper_edition_id,p_source_file_name,
 p_file_hash,p_page_count,p_pages_without_text,p_warnings,p_candidates,false);
end;
$wrapper$;
revoke all on function public.create_pdf_import_batch(uuid,text,text,integer,integer[],jsonb,jsonb,boolean) from public,anon;
grant execute on function public.create_pdf_import_batch(uuid,text,text,integer,integer[],jsonb,jsonb,boolean) to authenticated,service_role;

-- Direct REST access must obey the same per-module permissions as the Server Actions.
drop policy if exists pdf_import_batches_insert_staff on public.pdf_import_batches;
create policy pdf_import_batches_insert_staff on public.pdf_import_batches
for insert to authenticated with check(
 public.is_active_staff() and public.staff_can_module_action('editorial','edicoes_gerenciar'));
drop policy if exists pdf_import_candidates_insert_staff on public.pdf_import_candidates;
create policy pdf_import_candidates_insert_staff on public.pdf_import_candidates
for insert to authenticated with check(
 public.is_active_staff() and public.staff_can_module_action('editorial','edicoes_gerenciar'));
drop policy if exists pdf_import_candidates_update_staff_not_converted on public.pdf_import_candidates;
create policy pdf_import_candidates_update_staff_not_converted on public.pdf_import_candidates
for update to authenticated
using(public.is_active_staff() and status <> 'converted'
 and public.staff_can_module_action('editorial','materias_editar'))
with check(public.is_active_staff() and status <> 'converted'
 and public.staff_can_module_action('editorial','materias_editar'));
