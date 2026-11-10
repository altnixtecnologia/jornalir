-- Função usada apenas por trigger interno; não é endpoint RPC.
-- Funções de negócio continuam executáveis somente por authenticated e
-- validam auth.uid(), usuário ativo e permissão na própria função.
revoke all on function public.guard_editorial_workflow_close()
 from public, anon, authenticated;
