-- GUARDA adicionada em 17/10/2026 (reconciliação de histórico): este
-- arquivo já está aplicado no remoto sob este nome exato e depende de
-- public.contract_signature_invitations (criada por
-- 20261016233747_contract_signature_invitations.sql, também guardada —
-- ver nota lá). Criação real consolidada em
-- 20261017100005_contract_signature_family.sql (nova).
do $$
begin
  if to_regclass('public.contract_signature_invitations') is not null then
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
  end if;
end $$;
