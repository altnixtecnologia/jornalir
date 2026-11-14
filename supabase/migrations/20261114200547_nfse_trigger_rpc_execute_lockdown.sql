-- NFS-e: remover acesso RPC dos papeis publicos a funcoes auxiliares de gatilhos.
-- JA APLICADA no Supabase oficial em 14/11/2026, versao 20261114200547.
-- Este arquivo registra a migration no GitHub; nao reexecutar manualmente.
-- Triggers existentes continuam operando (nenhuma mudanca de dados, nem de logica fiscal).
set local lock_timeout = '3s';

revoke all on function public.set_nfse_certificate_actor() from public, anon, authenticated;
revoke all on function public.set_nfse_draft_actor() from public, anon, authenticated;
revoke all on function public.set_nfse_issued_note_actor() from public, anon, authenticated;
revoke all on function public.set_nfse_transmission_attempt_actor() from public, anon, authenticated;

grant execute on function public.set_nfse_certificate_actor() to service_role;
grant execute on function public.set_nfse_draft_actor() to service_role;
grant execute on function public.set_nfse_issued_note_actor() to service_role;
grant execute on function public.set_nfse_transmission_attempt_actor() to service_role;
