-- Aplicada no Supabase site-system-ir: 2026-10-16 22:20:53 (UTC).
-- Somente webhook Asaas autenticado no servidor (service_role) confirma Pix.
-- A chamada direta do navegador a esta RPC fica bloqueada.
REVOKE EXECUTE ON FUNCTION public.confirm_payment_charge(uuid,date,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment_charge(uuid,date,uuid)
  TO service_role;
