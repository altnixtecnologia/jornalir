-- Comercial -> Avisos gerais (push institucional para leitores do site/app) —
-- pedido explícito do usuário em 18/10/2026. NÃO aplicada ainda (local
-- apenas). Separado de propósito das notícias normais/urgentes (categoria de
-- consentimento própria) e das Assinaturas -> Avisos de vencimento (módulo
-- totalmente distinto, WhatsApp, não push).

-- ==================================================================
-- 1) Nova categoria de consentimento em site_push_subscriptions —
-- "avisos gerais" (comerciais/institucionais), independente de notícias
-- normais/urgentes. Default false: nunca inscreve ninguém sem consentimento
-- explícito (diferente de ordinary/urgent, que o formulário do site já
-- marca como pré-selecionado por padrão).
-- ==================================================================
alter table public.site_push_subscriptions
  add column if not exists administrative_enabled boolean not null default false;

comment on column public.site_push_subscriptions.administrative_enabled is
  'Avisos gerais/institucionais (Comercial -> Avisos) — categoria de consentimento própria, independente de ordinary_enabled/urgent_enabled (notícias). Default false: exige opt-in explícito do leitor.';

alter table public.site_push_subscriptions drop constraint if exists site_push_has_consent;
alter table public.site_push_subscriptions add constraint site_push_has_consent
  check (ordinary_enabled or urgent_enabled or administrative_enabled or not enabled);

-- ==================================================================
-- 2) Fila/claim de entregas: inclui o novo kind "administrative" (já
-- previsto no CHECK de notification_events.kind desde a fundação do
-- sistema, nunca usado até agora) com a mesma janela de validade das
-- notícias normais (24h) — avisos gerais não são "urgentes", mas também
-- não devem ser entregues dias depois de preparados.
-- ==================================================================
create or replace function public.queue_site_push_event()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.app_kind='site' and new.kind in ('ordinary','urgent','administrative') then
   insert into public.site_push_deliveries(event_id,subscription_id,status)
   select new.id,s.id,'pending'
   from public.site_push_subscriptions s
   where s.enabled and
     case new.kind
       when 'urgent' then s.urgent_enabled
       when 'administrative' then s.administrative_enabled
       else s.ordinary_enabled
     end
   on conflict(event_id,subscription_id) do nothing;
 end if;
 return new;
end $$;

create or replace function public.claim_site_push_deliveries(p_limit integer default 20)
returns table(delivery_id uuid,event_id uuid,subscription_id uuid)
language plpgsql security definer set search_path=''
as $
begin
 -- Preservar o processamento de encerramento da versão anterior da função:
 -- envios vencidos não podem ficar pendentes indefinidamente.
 update public.site_push_deliveries d
   set status='expired', last_error='Prazo de envio encerrado'
 from public.notification_events e
 where e.id=d.event_id and e.app_kind='site'
   and d.status='pending'
   and (
     (e.kind='urgent' and e.scheduled_at < now()-interval '1 hour')
     or (e.kind in ('ordinary','administrative') and e.scheduled_at < now()-interval '24 hours')
   );

 -- Uma entrega interrompida não é reenviada automaticamente: a resposta
 -- anterior pode ter chegado ao aparelho mesmo sem confirmação no servidor.
 update public.site_push_deliveries d
   set status='failed',
       last_error='Envio interrompido ou resultado incerto; não reenviar automaticamente'
 where d.status='sending' and d.attempted_at < now()-interval '5 minutes';

 return query
 with picked as (
   select d.id
   from public.site_push_deliveries d
   join public.notification_events e on e.id=d.event_id
   where d.status='pending' and e.app_kind='site'
     and e.scheduled_at<=now()
     and (
       (e.kind='urgent' and e.scheduled_at >= now()-interval '1 hour')
       or (e.kind='ordinary' and e.scheduled_at >= now()-interval '24 hours')
       or (e.kind='administrative' and e.scheduled_at >= now()-interval '24 hours')
     )
   order by (e.kind='urgent') desc,e.scheduled_at asc,d.attempted_at asc
   for update of d skip locked
   limit least(greatest(p_limit,1),100)
 )
 update public.site_push_deliveries d set status='sending',attempted_at=now()
 from picked where d.id=picked.id
 returning d.id,d.event_id,d.subscription_id;
end $$;

-- ==================================================================
-- 3) Rascunho/revisão/histórico dos avisos gerais — ANTES de existir aqui,
-- não havia como "salvar rascunho" sem já disparar a fila real (inserir em
-- notification_events aciona o trigger de enfileiramento imediatamente).
-- Esta tabela nova é o estágio de preparação; só ao confirmar o envio a
-- aplicação insere em notification_events (kind='administrative'), que aí
-- sim entra na fila de entrega de verdade.
-- ==================================================================
create table if not exists public.commercial_announcements (
  id uuid primary key default gen_random_uuid(),

  title text not null check (char_length(title) between 1 and 110),
  body text not null check (char_length(body) between 1 and 320),
  href text check (href is null or (href ~ '^/' and href !~ '^//' and href !~ E'[\\r\\n]')),

  status text not null default 'draft' check (status in ('draft','sent')),

  -- Idempotência do ENVIO (não da criação do rascunho) — o mesmo padrão já
  -- usado em notification_events.dedupe_key (ver enqueueSitePushAction),
  -- aqui como coluna própria porque o rascunho pode ser salvo/editado várias
  -- vezes antes do envio real.
  send_request_id uuid unique,
  notification_event_id uuid references public.notification_events (id),

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_by uuid references public.profiles (id),
  sent_at timestamptz,

  constraint commercial_announcements_sent_consistency check (
    (status = 'draft' and notification_event_id is null and sent_at is null and sent_by is null)
    or (status = 'sent' and notification_event_id is not null and sent_at is not null and sent_by is not null)
  )
);

comment on table public.commercial_announcements is
  'Rascunho/revisão/histórico dos avisos gerais (Comercial -> Avisos, push institucional para leitores). status=draft nunca aciona envio real; só a transição para status=sent (com notification_event_id preenchido) entra na fila de entrega de verdade.';

create index if not exists commercial_announcements_status_idx on public.commercial_announcements (status, created_at desc);

create trigger commercial_announcements_set_updated_at
  before update on public.commercial_announcements
  for each row execute function public.set_updated_at();

alter table public.commercial_announcements enable row level security;

-- Acesso restrito a owner/admin (nunca operator) — "acesso e disparo somente
-- para perfis autorizados", pedido explícito do usuário. RLS própria aqui
-- (tabela nova, sem os ~20 campos de preço de site_offer_settings que
-- justificaram manter a checagem só na aplicação para o Assine).
create policy commercial_announcements_admin_all
  on public.commercial_announcements for all
  to authenticated
  using (public.is_active_admin_or_owner())
  with check (public.is_active_admin_or_owner());
