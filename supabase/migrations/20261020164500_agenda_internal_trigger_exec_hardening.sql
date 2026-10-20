-- Auditoria e sincronizacao da Agenda: triggers internos nao sao API.
-- As RPCs operacionais autenticadas permanecem liberadas, sujeitas as
-- validacoes de equipe ativa, atribuicao e autorizacao de gestor.
revoke all on function public.audit_agenda_change() from public, anon, authenticated;
revoke all on function public.sync_pauta_primary_assignee() from public, anon, authenticated;
revoke all on function public.sync_pauta_snapshot_from_agenda() from public, anon, authenticated;
