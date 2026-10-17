-- Item 5, Lote 2, Tarefa 2: rastreio de reenvio de convite de assinatura.
-- NÃO aplicada ainda. Hoje "Preparar novo convite" no painel só
-- pré-preenche o formulário; a nova linha criada não tinha NENHUM
-- vínculo com o convite revogado/expirado que originou o reenvio —
-- o histórico ficava com duas linhas aparentemente independentes.
alter table public.contract_signature_invitations
  add column if not exists previous_invitation_id uuid
    references public.contract_signature_invitations(id) on delete set null;

comment on column public.contract_signature_invitations.previous_invitation_id is
  'Preenchido só quando este convite é um REENVIO de um convite anterior revogado/expirado do mesmo documento e signatário — nunca aponta para um convite ainda pending/signed (ver checagem em createSignatureInvitationAction). Permite reconstruir a cadeia completa de tentativas de um mesmo signatário.';
