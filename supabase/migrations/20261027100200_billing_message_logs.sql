-- Log de envio de cobrança ao cliente (WhatsApp) — arquitetura equivalente
-- à já usada no Altnix Informativo (Edge Function + log de mensagens),
-- preparada agora SEM nenhuma integração real (ver relatório da tarefa).
-- Incremental sobre 20261027100100_payment_charges.sql. NÃO aplicada ainda.
--
-- Nunca grava token/secret/credencial aqui — só o resultado do envio
-- (para quem, qual mensagem, status, id da mensagem no provedor quando
-- houver). `status = 'simulated'` é o único status possível em preview —
-- fora do preview, sem provedor configurado, a aplicação recusa o envio de
-- forma honesta (nunca grava 'sent' sem ter chamado um provedor real).
--
-- Imutável por desenho (sem policy de update/delete) — é um log de
-- auditoria, mesmo princípio de public.audit_events.

create table public.billing_message_logs (
  id uuid primary key default gen_random_uuid(),

  receivable_id uuid not null references public.receivables (id),
  client_id uuid not null references public.clients (id),

  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  to_phone text not null,
  message text not null,
  status text not null check (status in ('sent', 'failed', 'simulated')),
  provider_message_id text,
  error_message text,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.billing_message_logs is
  'Log de tentativas de envio de cobrança ao cliente (hoje só WhatsApp) — nunca um token/secret, só o resultado do envio. status=simulated é exclusivo do preview; fora dele, sem provedor configurado, a aplicação recusa o envio em vez de gravar um "sent" falso.';
comment on column public.billing_message_logs.to_phone is
  'WhatsApp do Cadastro mestre no momento do envio (snapshot) — nunca uma coluna nova em clients; o número vem sempre de clients.whatsapp.';

create index billing_message_logs_receivable_id_idx on public.billing_message_logs (receivable_id);
create index billing_message_logs_created_at_idx on public.billing_message_logs (created_at desc);

alter table public.billing_message_logs enable row level security;

create policy billing_message_logs_select_staff
  on public.billing_message_logs for select
  to authenticated
  using (public.is_active_staff());

create policy billing_message_logs_insert_staff
  on public.billing_message_logs for insert
  to authenticated
  with check (public.is_active_staff());

-- Sem policy de update/delete — log de auditoria imutável.
