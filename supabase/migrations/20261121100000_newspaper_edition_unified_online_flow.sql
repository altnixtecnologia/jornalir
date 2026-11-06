-- Fluxo unificado de carregamento do Jornal Online + automação editorial
-- (pedido do usuário, 06/11/2026). Incremental — não altera nenhuma
-- migration anterior, só estende colunas/funções já existentes. PENDENTE
-- DE APLICAÇÃO: preparada e versionada, mas não executada no Supabase
-- remoto nesta etapa (sem autorização para migration remota).
--
-- Resumo do que esta migration faz:
-- 1) Permite rascunho (status='draft') de `articles` sem editoria/
--    localidade — nunca enfraquece a exigência para published/scheduled.
-- 2) `convert_import_candidate_to_draft` deixa de exigir editoria/
--    localidade (a conversão automática de candidatos extraídos de PDF
--    precisa disso; a conversão manual pela tela de revisão continua
--    podendo informar os dois, como já fazia).
-- 3) Colunas novas em `newspaper_editions` para rastrear os DOIS processos
--    independentes (Jornal Online / separação de matérias) de forma
--    persistente — nunca só em memória/retorno de Server Action.
-- 4) `publish_due_newspaper_editions()` — função pg_cron NOVA e SEPARADA,
--    nunca altera `publish_due_scheduled_articles()` (matérias). Publica a
--    edição na hora agendada e dispara notificação (notification_events),
--    com estados independentes: falha de notificação nunca desfaz a
--    disponibilização já confirmada.

-- 1) ARTICLES: rascunho sem editoria/localidade -----------------------

alter table public.articles alter column section_id drop not null;
alter table public.articles alter column locality_id drop not null;
alter table public.articles alter column section_name drop not null;
alter table public.articles alter column locality_name drop not null;

-- A trigger `sync_article_section_locality_names` (20261008100100) já lida
-- corretamente com section_id/locality_id nulos: `select ... into` sem
-- linha encontrada deixa a variável NULL — nenhuma alteração necessária
-- na função, só a liberação das colunas acima.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.articles'::regclass
      and conname = 'articles_publishable_requires_section_locality'
  ) then
    alter table public.articles
      add constraint articles_publishable_requires_section_locality
      check (
        status not in ('published', 'scheduled')
        or (section_id is not null and locality_id is not null)
      );
  end if;
end $$;

comment on constraint articles_publishable_requires_section_locality on public.articles is
  'Rascunho (draft/adjusting) pode nascer sem editoria/localidade — ex.: conversão automática de candidatos extraídos de PDF, sem intervenção manual. Agendar ou publicar sempre exige os dois campos preenchidos antes.';

-- 2) convert_import_candidate_to_draft: permite editoria/localidade nulas --
-- Mesmo corpo da versão em 20261120240000_pdf_import_permissions_and_duplicate_lock.sql,
-- só removendo as duas exceções que bloqueavam p_section_id/p_locality_id
-- nulos. Nunca usa valor fictício — grava null de verdade; a equipe
-- completa na revisão, e a publicação continua bloqueada por
-- articles_publishable_requires_section_locality até isso acontecer.
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

  -- Editoria/localidade NÃO são mais exigidas aqui (decisão do usuário,
  -- 06/11/2026): a conversão automática de candidatos extraídos de PDF
  -- precisa poder criar o rascunho sem elas; a equipe completa na revisão.
  -- A publicação continua bloqueada sem os dois campos (constraint acima).

  v_base_slug := public.slugify_pt(p_title);
  v_slug := v_base_slug;
  while exists (select 1 from public.articles where slug = v_slug) loop
    v_attempt := v_attempt + 1;
    v_slug := v_base_slug || '-' || v_attempt;
  end loop;

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
  'Cria a matéria (sempre status=draft), vincula a mídia e marca o candidato como converted, tudo na mesma transação. Editoria/localidade podem ser nulas (06/11/2026) — a publicação continua exigindo os dois (articles_publishable_requires_section_locality). for update trava a linha do candidato — retry/duplo clique/corrida nunca gera uma segunda matéria.';

-- 3) NEWSPAPER_EDITIONS: estados persistentes dos dois processos ---------

alter table public.newspaper_editions
  add column if not exists scheduled_available_at timestamptz,
  add column if not exists available_at timestamptz,
  add column if not exists online_status text not null default 'preparing'
    check (online_status in ('preparing', 'scheduled', 'available', 'attention')),
  add column if not exists online_error text,
  -- pending: nada aconteceu ainda. queued: evento inserido em
  -- notification_events, aguardando o processamento real de entrega
  -- (push/site) — NUNCA significa "entregue". sent/partial/failed/uncertain
  -- refletem o resultado agregado real das entregas (site_push_deliveries +
  -- native_push_deliveries), atualizado pelo trigger
  -- sync_newspaper_edition_notification_status (ver seção 5 abaixo) —
  -- nunca otimista, nunca definido só por ter sido enfileirado. skipped:
  -- feature flag article_publish_events_enabled desligada.
  add column if not exists notification_status text not null default 'pending'
    check (notification_status in ('pending', 'queued', 'sent', 'partial', 'failed', 'skipped', 'uncertain')),
  add column if not exists notification_sent_at timestamptz,
  add column if not exists materias_status text
    check (materias_status is null or materias_status in ('queued', 'processing', 'completed', 'partial', 'failed')),
  add column if not exists materias_candidate_count integer,
  add column if not exists materias_draft_count integer,
  add column if not exists materias_failed_count integer,
  add column if not exists materias_started_at timestamptz,
  add column if not exists materias_finished_at timestamptz,
  add column if not exists uploaded_by uuid references public.profiles (id),
  add column if not exists uploaded_at timestamptz,
  add column if not exists scheduled_by uuid references public.profiles (id);

comment on column public.newspaper_editions.online_status is
  'Estado do processo Jornal Online: preparing (sem PDF ainda) / scheduled (PDF ok, aguardando scheduled_available_at) / available (publicada) / attention (falha, ver online_error).';
comment on column public.newspaper_editions.materias_status is
  'Estado da separação automática de matérias desta edição: null = nunca rodou (ex.: PDF histórico, nunca reprocessado automaticamente) / queued / processing / completed / partial (alguns candidatos falharam) / failed.';
comment on column public.newspaper_editions.scheduled_available_at is
  'Data/hora (UTC) em que a edição deve ficar disponível no Jornal Online. Padrão sugerido pela aplicação: dia seguinte ao upload às 07:00 America/Sao_Paulo; editável pelo operador para exceções.';
comment on column public.newspaper_editions.uploaded_by is
  'Staff que enviou/vinculou o PDF oficial desta edição (auditoria) — nunca inferido, sempre o usuário autenticado da Server Action.';
comment on column public.newspaper_editions.scheduled_by is
  'Staff que definiu/alterou a data e hora de disponibilização — usado para "Publicação automática executada pelo sistema, agendada por <nome>" na auditoria.';

create index if not exists newspaper_editions_scheduled_available_idx
  on public.newspaper_editions (online_status, scheduled_available_at)
  where online_status = 'scheduled';

-- BACKFILL (correção da auditoria, 06/11/2026): edições que já estavam
-- publicadas (active=true) ANTES deste fluxo precisam nascer com
-- online_status='available' — nunca 'preparing' (valor padrão da coluna
-- nova). Sem este backfill, qualquer reaproveitamento futuro do PDF de uma
-- edição histórica (ou da edição 776, se já pública) seria interpretado
-- como "primeira publicação" e cairia no ramo que agenda/desativa a
-- edição por até 24h — mesmo com a proteção também aplicada no código da
-- aplicação (markEditionUploadedAndSchedule/scheduleEditionAvailability
-- em newspaperEditionRepository.supabase.ts, que agora checa `active`
-- diretamente e nunca depende só deste backfill). Nenhuma edição inativa
-- é tocada aqui — nunca publica nada automaticamente.
update public.newspaper_editions
set online_status = 'available',
    available_at = coalesce(available_at, created_at, now())
where active = true
  and online_status <> 'available';

-- 4) pg_cron: publicação + notificação agendada das edições --------------
-- Função NOVA e SEPARADA de publish_due_scheduled_articles() (matérias) —
-- nunca a substitui nem altera seu comportamento.
--
-- Critério de seleção: só edições com online_status='scheduled' (nunca
-- 'preparing'/'attention'/'available' — logo, nenhuma das ~497 edições
-- históricas nem a 776, que o backfill acima já marcou 'available') E
-- scheduled_available_at <= now() (nulo por padrão — exige agendamento
-- explícito de um operador, nunca automático). `for update of e skip
-- locked` (correção da auditoria, item 5): se duas invocações do cron se
-- sobrepuserem (ex.: uma execução atrasada), a segunda pula as edições já
-- travadas pela primeira em vez de reprocessá-las — nunca duplica
-- audit_events nem notification_events, publicação permanece idempotente.
create or replace function public.publish_due_newspaper_editions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_enabled boolean;
  v_key text;
  v_scheduled_by_name text;
begin
  for r in
    select e.id, e.edition_number, e.cover_url, e.scheduled_by
    from public.newspaper_editions e
    where e.online_status = 'scheduled'
      and e.scheduled_available_at is not null
      and e.scheduled_available_at <= now()
    for update of e skip locked
  loop
    -- 1) Disponibiliza a edição de verdade. Esta atualização NUNCA é
    -- desfeita por uma falha de notificação abaixo (bloco separado).
    update public.newspaper_editions
    set online_status = 'available',
        active = true,
        available_at = now()
    where id = r.id;

    select p.name into v_scheduled_by_name from public.profiles p where p.id = r.scheduled_by;

    insert into public.audit_events (user_id, entity_type, entity_id, action, metadata)
    values (
      null, 'newspaper_editions', r.id, 'edition_published_auto',
      jsonb_build_object(
        'editionNumber', r.edition_number,
        'origin', 'cron:publish_due_newspaper_editions',
        'description',
          case when v_scheduled_by_name is not null
            then 'Publicação automática executada pelo sistema; agendada por ' || v_scheduled_by_name || '.'
            else 'Publicação automática executada pelo sistema.'
          end
      )
    );

    -- 2) Notificação — estado INDEPENDENTE da disponibilização acima. Um
    -- bloco BEGIN/EXCEPTION próprio (savepoint implícito do plpgsql): se
    -- a inserção em notification_events falhar por qualquer motivo, a
    -- atualização de online_status/available_at feita acima permanece.
    begin
      select article_publish_events_enabled into v_enabled
      from public.site_notification_feature_flags
      limit 1;

      if not coalesce(v_enabled, false) then
        update public.newspaper_editions set notification_status = 'skipped' where id = r.id;
        insert into public.audit_events (user_id, entity_type, entity_id, action, metadata)
        values (
          null, 'newspaper_editions', r.id, 'edition_notification_skipped',
          jsonb_build_object('editionNumber', r.edition_number, 'reason', 'article_publish_events_enabled=false',
            'origin', 'cron:publish_due_newspaper_editions')
        );
      else
        v_key := 'edition-available:' || r.id::text;
        -- IMPORTANTE (correção da auditoria, item 4): inserir em
        -- notification_events só ENFILEIRA a notificação — o trigger
        -- `queue_site_push_event` (20261015160348) e o processamento real
        -- de `/api/cron/push`/`/api/cron/native-push` é que efetivamente
        -- tentam a entrega (site_push_deliveries/native_push_deliveries).
        -- notification_status começa 'queued' aqui; o trigger
        -- sync_newspaper_edition_notification_status (abaixo) atualiza
        -- para sent/partial/failed/uncertain conforme o resultado real,
        -- nunca otimista.
        insert into public.notification_events (app_kind, kind, title, body, href, scheduled_at, dedupe_key)
        values (
          'site', 'ordinary',
          'Edição ' || r.edition_number || ' disponível no Jornal Online',
          'A nova edição já pode ser lida no Jornal Online.',
          '/jornal-online',
          now(),
          v_key
        )
        on conflict (dedupe_key) do nothing;

        update public.newspaper_editions
        set notification_status = 'queued'
        where id = r.id;

        insert into public.audit_events (user_id, entity_type, entity_id, action, metadata)
        values (
          null, 'newspaper_editions', r.id, 'edition_notification_queued',
          jsonb_build_object('editionNumber', r.edition_number, 'origin', 'cron:publish_due_newspaper_editions')
        );
      end if;
    exception when others then
      update public.newspaper_editions set notification_status = 'failed' where id = r.id;
      insert into public.audit_events (user_id, entity_type, entity_id, action, metadata)
      values (
        null, 'newspaper_editions', r.id, 'edition_notification_failed',
        jsonb_build_object('editionNumber', r.edition_number, 'error', sqlerrm,
          'origin', 'cron:publish_due_newspaper_editions')
      );
    end;
  end loop;
end;
$$;

comment on function public.publish_due_newspaper_editions() is
  'Disponibiliza automaticamente edições com online_status=scheduled cujo scheduled_available_at já passou, e dispara notification_events (notification_status independente — falha aqui nunca desfaz a disponibilização). Agendado via pg_cron, roda a cada minuto. NUNCA altera publish_due_scheduled_articles() (matérias) — função separada.';

select cron.schedule(
  'publish-due-newspaper-editions',
  '* * * * *',
  $$select public.publish_due_newspaper_editions();$$
);

-- 5) Estado REAL da notificação (correção da auditoria, item 4) ----------
-- notification_status nunca é 'sent' só por ter sido enfileirado. Este
-- trigger agrega o resultado de verdade das entregas (site_push_deliveries
-- + native_push_deliveries, as duas tabelas já existentes que o fluxo de
-- push de verdade usa) sempre que uma entrega muda de status — chamado
-- pelos crons já existentes /api/cron/push e /api/cron/native-push, nunca
-- código novo de envio. Mapeamento de status agregado:
--   nenhuma entrega ainda terminou (tudo pending/sending) -> 'queued'
--   todas terminaram e todas 'sent'                        -> 'sent'
--   todas terminaram e todas 'failed'/'expired'            -> 'failed'
--   todas terminaram e pelo menos uma 'uncertain'          -> 'uncertain'
--   mistura de sent e failed/expired entre as terminadas   -> 'partial'
-- "Entregue ao aparelho" nunca é afirmado sem confirmação efetiva: 'sent'
-- aqui significa que o provedor de push aceitou a entrega (resposta HTTP
-- ok), não que o usuário abriu/visualizou a notificação — o modal de
-- detalhes deve expor exatamente isso, nunca "visualizada pelo usuário".
create or replace function public.sync_newspaper_edition_notification_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_edition_id uuid;
  v_total integer;
  v_sent integer;
  v_bad integer;
  v_uncertain integer;
  v_pending integer;
  v_next_status text;
begin
  select (regexp_match(e.dedupe_key, '^edition-available:([0-9a-fA-F-]{36})$'))[1]::uuid
  into v_edition_id
  from public.notification_events e
  where e.id = new.event_id;

  if v_edition_id is null then
    return new;
  end if;

  select
    count(*),
    count(*) filter (where status = 'sent'),
    count(*) filter (where status in ('failed', 'expired')),
    count(*) filter (where status = 'uncertain'),
    count(*) filter (where status in ('pending', 'sending'))
  into v_total, v_sent, v_bad, v_uncertain, v_pending
  from (
    select status from public.site_push_deliveries where event_id = new.event_id
    union all
    select status from public.native_push_deliveries where event_id = new.event_id
  ) deliveries;

  if v_total = 0 or v_pending > 0 then
    v_next_status := 'queued';
  elsif v_sent = v_total then
    v_next_status := 'sent';
  elsif v_sent = 0 and v_uncertain = 0 then
    v_next_status := 'failed';
  elsif v_sent = 0 and v_bad = 0 then
    v_next_status := 'uncertain';
  else
    v_next_status := 'partial';
  end if;

  update public.newspaper_editions
  set notification_status = v_next_status,
      notification_sent_at = case
        when v_sent > 0 and notification_sent_at is null then now()
        else notification_sent_at
      end
  where id = v_edition_id;

  return new;
end;
$$;
revoke all on function public.sync_newspaper_edition_notification_status() from public, anon, authenticated;

drop trigger if exists trg_sync_edition_notification_site on public.site_push_deliveries;
create trigger trg_sync_edition_notification_site
  after update of status on public.site_push_deliveries
  for each row
  when (new.status is distinct from old.status)
  execute function public.sync_newspaper_edition_notification_status();

drop trigger if exists trg_sync_edition_notification_native on public.native_push_deliveries;
create trigger trg_sync_edition_notification_native
  after update of status on public.native_push_deliveries
  for each row
  when (new.status is distinct from old.status)
  execute function public.sync_newspaper_edition_notification_status();

comment on function public.sync_newspaper_edition_notification_status() is
  'Mantém newspaper_editions.notification_status fiel ao resultado REAL das entregas (site_push_deliveries/native_push_deliveries) — nunca "sent" por só ter sido enfileirado. Disparado pelos crons de push já existentes (/api/cron/push, /api/cron/native-push), nenhum código de envio novo.';

-- 6) Worker durável de separação de matérias (correção da auditoria, item 3) --
-- pg_cron SÓ executa SQL — não roda PDF.js/Node. O mecanismo real já usado
-- neste projeto para acionar trabalho Node a partir do Postgres é pg_net
-- com um segredo no Vault (ver invoke_agenda_telegram_cron, 20261014202640),
-- chamando um endpoint Next.js autenticado por Bearer (CRON_SECRET). Esta
-- função replica exatamente esse padrão para
-- /api/cron/edition-materias (apps/sistema/src/app/api/cron/edition-materias/route.ts).
--
-- DEPENDÊNCIA DE AMBIENTE (documentada, não aplicável localmente): é
-- necessário cadastrar no Vault remoto um segredo chamado
-- 'edition_materias_cron_secret' com o MESMO valor da variável de ambiente
-- CRON_SECRET da Vercel (apps/sistema) — sem isso, a função abaixo lança
-- excecão e o cron não aciona o worker. Esta migration NUNCA insere o
-- valor do segredo (prática já seguida por agenda_telegram_cron_secret).
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_edition_materias_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare bearer text;
begin
  select decrypted_secret into bearer from vault.decrypted_secrets
  where name = 'edition_materias_cron_secret' limit 1;
  if bearer is null or length(bearer) < 32 then
    raise exception 'Worker de separação de matérias não configurado no Vault (edition_materias_cron_secret).';
  end if;
  perform net.http_get(
    url := 'https://controle.altnix.com.br/api/cron/edition-materias',
    headers := jsonb_build_object('Authorization', 'Bearer ' || bearer),
    timeout_milliseconds := 20000
  );
end;
$fn$;
revoke all on function public.invoke_edition_materias_cron() from public, anon, authenticated;

do $schedule$
begin
  if not exists (
    select 1 from cron.job where jobname = 'edition-materias-worker'
  ) then
    perform cron.schedule(
      'edition-materias-worker',
      '* * * * *',
      'select public.invoke_edition_materias_cron();'
    );
  end if;
end;
$schedule$;

-- Reivindicação atômica (for update skip locked, mesmo padrão comprovado
-- de claim_site_push_deliveries/claim_native_push_deliveries): uma edição
-- só é processada por UMA chamada concorrente do worker por vez. Também
-- serve de retomada automática de trabalho preso: uma edição com
-- materias_status='processing' cujo materias_started_at já passou de
-- p_lease_minutes (o worker travou/foi encerrado no meio) volta a ser
-- elegível para reivindicação, sem nenhuma intervenção manual.
create or replace function public.claim_newspaper_editions_for_materias_work(
  p_limit integer default 3,
  p_lease_minutes integer default 10
)
returns table(edition_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select e.id
    from public.newspaper_editions e
    where e.materias_status = 'queued'
       or (
         e.materias_status = 'processing'
         and e.materias_started_at is not null
         and e.materias_started_at < now() - (p_lease_minutes || ' minutes')::interval
       )
    order by e.materias_started_at asc nulls first
    for update of e skip locked
    limit least(greatest(p_limit, 1), 20)
  )
  update public.newspaper_editions e
  set materias_status = 'processing', materias_started_at = now()
  from picked
  where e.id = picked.id
  returning e.id;
end;
$$;
revoke all on function public.claim_newspaper_editions_for_materias_work(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_newspaper_editions_for_materias_work(integer, integer) to service_role;

comment on function public.claim_newspaper_editions_for_materias_work(integer, integer) is
  'Reivindica (lease) edições com separação de matérias na fila ou presas em processing além do lease — usado por /api/cron/edition-materias. for update skip locked garante que duas execuções concorrentes nunca reivindiquem a mesma edição.';
