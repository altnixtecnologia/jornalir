-- Bloquear manipulação direta de cobranças por PostgREST.
-- pix_gerar permite INSERT da reserva antes do Asaas, mas NÃO dá permissão
-- de marcar pago/cancelado ou trocar provider_charge_id por PATCH direto.
-- Server Actions conferem permissão e operam a finalização pelo
-- cliente service_role no servidor; confirm_payment_charge continua
-- exclusivamente RPC transacional service_role.
drop policy if exists payment_charges_update_staff on public.payment_charges;
revoke update on public.payment_charges from public, anon, authenticated;
grant update on public.payment_charges to service_role;
comment on table public.payment_charges is
  'Cobrança Pix. INSERT por funcionário com pix_gerar reserva título ANTES do POST Asaas; UPDATE só no servidor com service_role após conciliação. Pagamento somente via RPC transacional service_role.';
