-- NOVA em 17/10/2026 (preparação de publicação, reconciliação de
-- histórico). Executa a restrição que já existe (protegida por guarda
-- to_regprocedure) em
-- 20261016222053_restrict_payment_confirmation_rpc_to_service_role.sql —
-- aquele arquivo já está aplicado no remoto sob este nome exato e é 11
-- dias anterior a public.confirm_payment_charge
-- (20261027100300_confirm_payment_charge_rpc.sql, aplicada imediatamente
-- antes desta).
REVOKE EXECUTE ON FUNCTION public.confirm_payment_charge(uuid,date,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment_charge(uuid,date,uuid)
  TO service_role;
