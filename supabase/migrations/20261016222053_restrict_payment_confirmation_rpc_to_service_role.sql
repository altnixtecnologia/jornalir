-- GUARDA adicionada em 17/10/2026 (reconciliação de histórico): este
-- arquivo já está aplicado no remoto sob este nome exato e depende da
-- função public.confirm_payment_charge, criada em
-- 20261027100300_confirm_payment_charge_rpc.sql, 11 dias DEPOIS deste
-- arquivo. Restrição real para fresh install em
-- 20261027100310_restrict_payment_confirmation_rpc_to_service_role.sql
-- (nova, depois da função existir).
do $$
begin
  if to_regprocedure('public.confirm_payment_charge(uuid,date,uuid)') is not null then
    -- confirm_payment_charge deve ser chamado somente pelo webhook autenticado
    -- do Asaas, usando SUPABASE_SERVICE_ROLE_KEY no servidor.
    -- Nao permitir que o navegador invoque esta rotina e simule um pagamento.
    REVOKE EXECUTE ON FUNCTION public.confirm_payment_charge(uuid,date,uuid)
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.confirm_payment_charge(uuid,date,uuid)
      TO service_role;
  end if;
end $$;
