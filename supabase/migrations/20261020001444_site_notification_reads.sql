-- Central de notificações do leitor (sininho do site/app) — 18/10/2026.
--
-- Não cria um segundo sistema de disparo: reaproveita notification_events
-- (já existente, app_kind='site') como fonte dos itens exibidos. Esta
-- migration apenas acrescenta o estado de "lido" por dispositivo anônimo,
-- usando o mesmo hash de identidade já usado por site_push_subscriptions
-- (sha256("site-push:" + managementToken), guardado só no localStorage do
-- leitor — nunca exige login).
--
-- PENDENTE DE APLICAÇÃO: preparada e versionada, mas não executada no
-- Supabase remoto nesta etapa (aguardando autorização separada, conforme
-- CLAUDE.md). Sem esta migration aplicada, /api/public/notifications (POST)
-- não tem onde persistir o estado de leitura.

create table if not exists public.site_notification_reads (
  management_hash text not null,
  event_id uuid not null references public.notification_events(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (management_hash, event_id),
  constraint site_notification_reads_hash_len check (char_length(management_hash) = 64)
);

comment on table public.site_notification_reads is
  'Estado de leitura por dispositivo anônimo (hash do management token do leitor, mesmo usado em site_push_subscriptions) da central de notificações do site/app. Não requer login; nunca guarda o token em claro.';

alter table public.site_notification_reads enable row level security;

-- Mesmo modelo de site_push_subscriptions: nenhum acesso direto do
-- navegador. Toda leitura/escrita passa pela rota de serviço
-- /api/public/notifications (service_role), que valida o management token
-- antes de qualquer consulta.
revoke all on public.site_notification_reads from anon, authenticated;

-- Acelera "quais eventos de site ainda não foram lidos por este hash",
-- consulta principal da central de notificações.
create index if not exists site_notification_reads_hash_idx
  on public.site_notification_reads (management_hash);

-- Acelera o feed público (app_kind='site', mais recentes primeiro), lido
-- pela mesma rota de serviço.
create index if not exists notification_events_site_feed_idx
  on public.notification_events (scheduled_at desc)
  where app_kind = 'site';
