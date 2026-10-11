-- Restaurada localmente na reconciliação de migrations (ver relatório da
-- tarefa) — conteúdo confirmado diretamente do ledger remoto, onde esta
-- migration JÁ ESTÁ aplicada sob a versão 20261025100000. Arquivo local
-- havia sido perdido/nunca versionado neste repositório; não existe em
-- nenhuma branch nem no histórico git. NÃO reaplicar — já está no remoto.
--
-- Hardening de acesso a public.nfse_certificates: adiciona fingerprint
-- (identificação segura do certificado na interface, sem expor o
-- material sensível) e restringe o acesso diretamente a service_role —
-- remove as policies admin_owner anteriores e revoga acesso de
-- anon/authenticated.

alter table public.nfse_certificates
  add column fingerprint text not null;

comment on column public.nfse_certificates.fingerprint is
  'Fingerprint SHA-256 do certificado público, usado somente para identificação segura na interface.';

drop policy if exists nfse_certificates_select_admin_owner
  on public.nfse_certificates;

drop policy if exists nfse_certificates_insert_admin_owner
  on public.nfse_certificates;

drop policy if exists nfse_certificates_update_admin_owner
  on public.nfse_certificates;

revoke all on table public.nfse_certificates from anon, authenticated;

grant select, insert, update
  on table public.nfse_certificates
  to service_role;
