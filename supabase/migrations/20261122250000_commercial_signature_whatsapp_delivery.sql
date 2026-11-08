-- Etapa 4 — rastreio de convite comercial pela Cloud API da Meta.
-- Não aplicada ao banco. Token em texto puro NUNCA é salvo.

alter table public.commercial_signature_invitations
  add column notification_channel text not null default 'manual'
    check (notification_channel in ('manual','whatsapp')),
  add column notification_status text not null default 'not_sent'
    check (notification_status in ('not_sent','accepted_by_meta','failed','uncertain')),
  add column notification_message_id text,
  add column notification_attempted_at timestamptz,
  add column notification_error text;

alter table public.commercial_signature_invitations add constraint
  commercial_signature_delivery_consistency check (
    (notification_channel='manual' and notification_status='not_sent'
       and notification_message_id is null)
    or
    (notification_channel='whatsapp' and
      ((notification_status='accepted_by_meta' and notification_message_id is not null)
       or (notification_status in ('not_sent','failed','uncertain') and notification_message_id is null)))
  );

comment on column public.commercial_signature_invitations.notification_status is
  'accepted_by_meta significa aceito para envio, não entregue/lido. Em timeout: uncertain, sem reenvio automático.';

-- A atualização de entrega é feita exclusivamente pela Server Action após
-- a verificação do operador, com cliente service_role. Usuários autenticados
-- recebem apenas SELECT conforme as políticas já existentes.
