alter table public.contract_signature_invitations
  add column if not exists notification_channel text not null default 'manual'
    check (notification_channel in ('manual','whatsapp')),
  add column if not exists notification_status text not null default 'not_sent'
    check (notification_status in ('not_sent','accepted_by_meta','failed')),
  add column if not exists notification_message_id text,
  add column if not exists notification_attempted_at timestamptz,
  add column if not exists notification_error text;

comment on column public.contract_signature_invitations.notification_status is
  'accepted_by_meta = API da Meta confirmou o ID; NAO comprova entrega ao cliente.';
