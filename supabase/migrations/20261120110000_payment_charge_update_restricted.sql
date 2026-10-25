-- Fechar escrita direta de cobranças por PostgREST.
-- Criação/cancelamento via Server Action com checkFinanceAction e validação
-- do título, cliente, saldo e Asaas; persistência com service_role.
-- Webhook autenticado continua sendo o único autorizador de baixa pela
-- RPC confirm_payment_charge (row locks e idempotência).
drop policy if exists payment_charges_insert_staff on public.payment_charges;
drop policy if exists payment_charges_update_staff on public.payment_charges;
revoke insert, update on public.payment_charges from public, anon, authenticated;
grant insert, update on public.payment_charges to service_role;
comment on table public.payment_charges is
  'Cobrança Pix. Antes de POST no Asaas, Server Action autorizada reserva título em INSERT service_role. Operador não pode inserir/atualizar diretamente por PostgREST. Confirmação exclusivamente por RPC de baixa service_role.';
