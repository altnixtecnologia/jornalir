-- Integração real: publicação de matéria -> notification_events (18/10/2026).
--
-- PENDENTE DE APLICAÇÃO: preparada e versionada, mas não executada no
-- Supabase remoto nesta etapa (aguardando autorização separada, conforme
-- CLAUDE.md). Aplicar depois de 20261030100500_site_notification_reads.sql
-- (ordem não é estritamente obrigatória entre as duas, mas mantém o lote
-- de notificações agrupado e aplicado numa sequência só).
--
-- Contexto (levantado antes de escrever esta migration): existem HOJE três
-- caminhos de código independentes que levam public.articles.status a
-- 'published' — ArticleService.publishNow() (publicar manualmente),
-- public.publish_due_scheduled_articles() (pg_cron, matérias agendadas) e
-- ArticleService.importLegacyArticle() (import direto, sem chamador real
-- hoje). Nenhum desses três é um "único ponto" na aplicação — mas os três
-- já convergem no gatilho article_push_on_published, que já existe desde
-- 20261015080000_push_editorial_publication_outbox.sql. Em vez de duplicar
-- essa lógica nos três lugares (e arriscar perder um caminho), esta
-- migration só troca o CORPO do gatilho existente: continua a mesma
-- trigger, o mesmo guard de idempotência (not re-fire se já estava
-- published), mas agora insere de verdade em notification_events — tabela
-- real já consumida pela central de notificações do leitor e pelo cron de
-- envio — em vez da notification_outbox legada, que nenhum código em
-- produção lê (confirmado: grep em apps/sistema e apps/site não encontra
-- nenhuma leitura de notification_outbox).
--
-- Trava de segurança (pedido explícito do usuário): o disparo automático
-- fica DESLIGADO por padrão até autorização separada para testar envio
-- real. Como o pg_cron corre fora da aplicação Next.js, uma variável de
-- ambiente comum não alcançaria esse caminho — por isso a trava é uma
-- linha de configuração no próprio banco (site_notification_feature_flags),
-- lida pelo gatilho antes de inserir qualquer evento. Enquanto
-- article_publish_events_enabled=false (padrão), NENHUM evento é criado
-- por publicação de matéria, em nenhum dos três caminhos — zero risco de
-- "armar" sem querer o cron de envio real (/api/cron/push), mesmo que ele
-- já esteja agendado em algum ambiente.

create table if not exists public.site_notification_feature_flags (
  id boolean primary key default true check (id),
  article_publish_events_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.site_notification_feature_flags (id, article_publish_events_enabled)
values (true, false)
on conflict (id) do nothing;

comment on table public.site_notification_feature_flags is
  'Configuração server-side (uma linha só) para destravar disparos automáticos de notificação. article_publish_events_enabled controla se a publicação de matérias gera notification_events; começa desligado por padrão e só deve ser ligado após autorização explícita de testar envio real.';

alter table public.site_notification_feature_flags enable row level security;

-- Nenhum acesso direto do navegador nem de staff comum — só service_role
-- (painel admin, quando/se for exposto um toggle) e a função
-- security definer abaixo, que roda com privilégios do dono da função.
revoke all on public.site_notification_feature_flags from anon, authenticated;

create or replace function public.queue_article_push_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_mode text;
  v_kind text;
  v_key text;
begin
  -- Mesmo guard de idempotência já existente: só na transição real para
  -- "published" (não refaz ao salvar/editar uma matéria já publicada).
  if new.status <> 'published' or (tg_op = 'UPDATE' and old.status = 'published') then
    return new;
  end if;

  v_mode := coalesce(new.notification_mode, 'none');
  if v_mode not in ('normal', 'urgent') then
    return new; -- "Sem notificação" nunca gera evento.
  end if;
  if new.slug is null or new.slug = '' then
    return new; -- Sem slug não existe URL pública válida para o leitor.
  end if;

  select article_publish_events_enabled into v_enabled
  from public.site_notification_feature_flags
  limit 1;
  if not coalesce(v_enabled, false) then
    return new; -- Desativado por padrão até autorização explícita.
  end if;

  v_kind := case when v_mode = 'urgent' then 'urgent' else 'ordinary' end;
  -- Mesma chave por matéria em qualquer transição futura (reagendar,
  -- republicar depois de arquivar etc. não duplica — on conflict abaixo).
  v_key := 'article-publish:' || new.id::text;

  insert into public.notification_events (app_kind, kind, title, body, href, scheduled_at, dedupe_key)
  values (
    'site',
    v_kind,
    left(new.title, 140),
    left(coalesce(new.subtitle, ''), 280),
    '/noticias/' || new.slug,
    now(),
    v_key
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

revoke all on function public.queue_article_push_on_publish() from public, anon, authenticated;

comment on function public.queue_article_push_on_publish() is
  'Gera notification_events (app_kind=site) quando uma matéria entra de verdade em status=published com notification_mode normal/urgent. Idempotente via dedupe_key (''article-publish:''||id) e via guard de transição (não refaz em matéria já publicada). Desligado por padrão (site_notification_feature_flags.article_publish_events_enabled=false) até autorização explícita de testar envio real. Substitui o comportamento anterior desta mesma trigger, que inserção na notification_outbox legada (nenhum código em produção a lê).';

-- A trigger já existe (article_push_on_published, AFTER INSERT OR UPDATE OF
-- status) desde 20261015080000 — só a função mudou de corpo acima, então
-- não é preciso recriar a trigger. Recriar aqui mesmo assim, de forma
-- idempotente, só para o caso de o ambiente de destino nunca ter aplicado
-- aquela migration isoladamente.
drop trigger if exists article_push_on_published on public.articles;
create trigger article_push_on_published
after insert or update of status on public.articles
for each row execute function public.queue_article_push_on_publish();
