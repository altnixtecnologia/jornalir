-- Etapa 2 de permissoes: proteger o acesso direto via PostgREST/RPC.
-- ATENCAO: somente versionada; aplicar apos validar em ambiente isolado.
-- Dependencia: 20261015222852_staff_module_visibility_and_finance_actions.sql.
-- Owner/admin possuem acesso total. Operadores: deny-by-default.
--
-- Bloqueio de confirm_payment_charge para authenticated: somente webhook
-- autenticado pelo backend/service_role pode confirmar Pix em producao.
revoke execute on function public.confirm_payment_charge(uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.confirm_payment_charge(uuid, date, uuid) to service_role;

-- Trigger com invoker, sem bypass de RLS. Protege mutacoes feitas diretamente
-- pela Data API: nao basta validar somente as Server Actions do Next.js.
create or replace function public.enforce_finance_mutation_permission()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare
  v_action text;
  v_received numeric;
  v_adjusted numeric;
  v_expected_status text;
begin
  -- Somente servicos internos de backend (webhook Asaas com service_role)
  -- e manutencao postgres podem executar processamento externo autorizado.
  if current_user in ('service_role','postgres') then return new; end if;

  if not public.staff_can_see_module('financeiro') then
    raise exception 'Modulo Financeiro nao autorizado' using errcode = '42501';
  end if;

  if tg_table_name = 'receivables' then
    if tg_op = 'INSERT' then
      v_action := 'titulos_criar';
    else
      if new.status is distinct from old.status and new.status = 'cancelled' then
        v_action := 'titulos_cancelar';
      elsif new.status is distinct from old.status and old.status = 'cancelled' then
        v_action := 'titulos_reabrir';
      elsif (to_jsonb(new) - 'status' - 'updated_at') is distinct from
            (to_jsonb(old) - 'status' - 'updated_at') then
        v_action := 'titulos_editar';
      elsif new.status is distinct from old.status then
        -- Mudancas de status normais vem de recebimento, ajuste, credito ou
        -- estorno; verificar tambem o saldo do ledger, sem permitir quitar
        -- apenas alterando status diretamente pelo REST.
        if not (
          public.staff_can_finance_action('recebimentos_baixar')
          or public.staff_can_finance_action('recebimentos_estornar')
          or public.staff_can_finance_action('ajustes_criar')
          or public.staff_can_finance_action('ajustes_estornar')
          or public.staff_can_finance_action('creditos_aplicar')
        ) then
          raise exception 'Mudanca de status financeira nao autorizada' using errcode = '42501';
        end if;
      end if;

      if new.status is distinct from old.status and new.status <> 'cancelled' then
        select coalesce(sum(amount),0) into v_received
          from public.receivable_receipts where receivable_id=new.id and reversed_at is null;
        select coalesce(sum(amount),0) into v_adjusted
          from public.receivable_adjustments where receivable_id=new.id and reversed_at is null;
        v_expected_status := case
          when new.original_amount - v_received - v_adjusted <= 0 then 'paid'
          when v_received + v_adjusted > 0 then 'partially_paid'
          else 'open'
        end;
        if new.status <> v_expected_status then
          raise exception 'Status deve refletir o saldo real do titulo' using errcode = '42501';
        end if;
      end if;
    end if;

  elsif tg_table_name = 'receivable_receipts' then
    if tg_op = 'INSERT' then
      v_action := 'recebimentos_baixar';
    else
      v_action := 'recebimentos_estornar';
      if old.reversed_at is not null or new.reversed_at is null
        or (to_jsonb(new) - 'reversed_at' - 'reversed_by' - 'reversal_reason') is distinct from
           (to_jsonb(old) - 'reversed_at' - 'reversed_by' - 'reversal_reason')
        or new.reversed_by is distinct from auth.uid() then
          raise exception 'Somente o estorno rastreavel do recebimento e permitido' using errcode='42501';
      end if;
    end if;

  elsif tg_table_name = 'receivable_adjustments' then
    if tg_op = 'INSERT' then
      if new.adjustment_type = 'credit_applied' then
        v_action := 'creditos_aplicar';
      elsif new.adjustment_type = 'settlement_difference' then
        v_action := 'recebimentos_quitar_diferenca';
        if not public.staff_can_finance_action('ajustes_criar') then
          raise exception 'Permissao de abatimentos requerida' using errcode='42501';
        end if;
      else
        v_action := 'ajustes_criar';
      end if;
    else
      v_action := 'ajustes_estornar';
      if old.reversed_at is not null or new.reversed_at is null
        or (to_jsonb(new) - 'reversed_at' - 'reversed_by' - 'reversal_reason') is distinct from
           (to_jsonb(old) - 'reversed_at' - 'reversed_by' - 'reversal_reason')
        or new.reversed_by is distinct from auth.uid() then
          raise exception 'Somente o estorno rastreavel do ajuste e permitido' using errcode='42501';
      end if;
    end if;

  elsif tg_table_name = 'payment_charges' then
    if tg_op = 'INSERT' then
      v_action := 'pix_gerar';
    elsif old.status = 'pending' and new.status = 'cancelled'
      and (to_jsonb(new) - 'status' - 'cancelled_at' - 'cancelled_by' - 'cancellation_reason' - 'updated_at') =
          (to_jsonb(old) - 'status' - 'cancelled_at' - 'cancelled_by' - 'cancellation_reason' - 'updated_at')
      and new.cancelled_by = auth.uid() then
      v_action := 'pix_cancelar';
    elsif not public.is_active_admin_or_owner() then
      raise exception 'Alteracao de cobranca Pix nao autorizada' using errcode='42501';
    end if;
  end if;

  if v_action is not null and not public.staff_can_finance_action(v_action) then
    raise exception 'Permissao financeira ausente: %',v_action using errcode='42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_finance_mutation_permission() from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array['receivables','receivable_receipts','receivable_adjustments','payment_charges']
  loop
    execute format('drop trigger if exists enforce_finance_permission on public.%I',t);
    execute format('create trigger enforce_finance_permission before insert or update on public.%I for each row execute function public.enforce_finance_mutation_permission()',t);
  end loop;
end;
$$;

-- Restringir a leitura a quem tem o modulo habilitado e as escritas as
-- acoes permitidas. RLS de UPDATE precisa de SELECT e WITH CHECK.
do $$
declare
  t text;
begin
  foreach t in array array[
    'receivables','receivable_receipts','receivable_adjustments',
    'payment_charges','client_credits','institutional_contracts',
    'contract_documents','contract_amendments','contract_commitment_orders',
    'billing_message_logs'
  ]
  loop
    execute format('drop policy if exists %I on public.%I',t || '_select_staff',t);
    execute format(
      'create policy finance_module_select on public.%I for select to authenticated using ((select public.staff_can_see_module(''financeiro'')))',t
    );
  end loop;
end;
$$;

-- Titulos: transicoes/edicoes sao verificadas tambem pelo trigger.
drop policy if exists receivables_insert_staff on public.receivables;
create policy finance_receivables_insert on public.receivables for insert to authenticated
with check ((select public.staff_can_finance_action('titulos_criar')));
drop policy if exists receivables_update_staff on public.receivables;
create policy finance_receivables_update on public.receivables for update to authenticated
using ((select public.staff_can_see_module('financeiro')))
with check ((select public.staff_can_see_module('financeiro')));

drop policy if exists receivable_receipts_insert_staff on public.receivable_receipts;
create policy finance_receipts_insert on public.receivable_receipts for insert to authenticated
with check ((select public.staff_can_finance_action('recebimentos_baixar')));
drop policy if exists receivable_receipts_update_staff on public.receivable_receipts;
create policy finance_receipts_reverse on public.receivable_receipts for update to authenticated
using ((select public.staff_can_finance_action('recebimentos_estornar')))
with check ((select public.staff_can_finance_action('recebimentos_estornar')));

drop policy if exists receivable_adjustments_insert_staff on public.receivable_adjustments;
create policy finance_adjustments_insert on public.receivable_adjustments for insert to authenticated
with check (
  (adjustment_type='credit_applied' and (select public.staff_can_finance_action('creditos_aplicar')))
  or (adjustment_type='settlement_difference' and (select public.staff_can_finance_action('recebimentos_quitar_diferenca')) and (select public.staff_can_finance_action('ajustes_criar')))
  or (adjustment_type not in ('credit_applied','settlement_difference') and (select public.staff_can_finance_action('ajustes_criar')))
);
drop policy if exists receivable_adjustments_update_staff on public.receivable_adjustments;
create policy finance_adjustments_reverse on public.receivable_adjustments for update to authenticated
using ((select public.staff_can_finance_action('ajustes_estornar')))
with check ((select public.staff_can_finance_action('ajustes_estornar')));

drop policy if exists payment_charges_insert_staff on public.payment_charges;
create policy finance_pix_insert on public.payment_charges for insert to authenticated
with check ((select public.staff_can_finance_action('pix_gerar')));
drop policy if exists payment_charges_update_staff on public.payment_charges;
create policy finance_pix_update on public.payment_charges for update to authenticated
using ((select public.staff_can_finance_action('pix_cancelar')))
with check ((select public.staff_can_finance_action('pix_cancelar')));

drop policy if exists billing_message_logs_insert_staff on public.billing_message_logs;
create policy finance_whatsapp_send on public.billing_message_logs for insert to authenticated
with check ((select public.staff_can_finance_action('pix_enviar')));

drop policy if exists institutional_contracts_insert_staff on public.institutional_contracts;
create policy finance_contract_insert on public.institutional_contracts for insert to authenticated
with check ((select public.staff_can_finance_action('contratos_criar')));
drop policy if exists institutional_contracts_update_staff on public.institutional_contracts;
create policy finance_contract_update on public.institutional_contracts for update to authenticated
using ((select public.staff_can_finance_action('contratos_editar')))
with check ((select public.staff_can_finance_action('contratos_editar')));

drop policy if exists contract_documents_insert_staff on public.contract_documents;
create policy finance_contract_document_insert on public.contract_documents for insert to authenticated
with check (
  (select public.staff_can_finance_action('contratos_criar'))
  or (select public.staff_can_finance_action('contratos_editar'))
);

drop policy if exists contract_amendments_insert_staff on public.contract_amendments;
create policy finance_contract_amendment_insert on public.contract_amendments for insert to authenticated
with check ((select public.staff_can_finance_action('contratos_editar')));

drop policy if exists contract_commitment_orders_insert_staff on public.contract_commitment_orders;
create policy finance_contract_order_insert on public.contract_commitment_orders for insert to authenticated
with check ((select public.staff_can_finance_action('contratos_editar')));

drop policy if exists client_credits_insert_staff on public.client_credits;
create policy finance_client_credits_insert on public.client_credits for insert to authenticated
with check ((select public.staff_can_finance_action('recebimentos_baixar')));
drop policy if exists client_credits_update_staff on public.client_credits;
create policy finance_client_credits_update on public.client_credits for update to authenticated
using ((select public.is_active_admin_or_owner()))
with check ((select public.is_active_admin_or_owner()));

-- Sem deletes para usuarios autenticados nas entidades financeiras.
revoke delete on public.receivables,public.receivable_receipts,public.receivable_adjustments,
  public.payment_charges,public.client_credits,public.institutional_contracts,
  public.contract_documents,public.contract_amendments,public.contract_commitment_orders,
  public.billing_message_logs from authenticated;

-- REVISAO FASE 3 (2026-10-15): TRUNCATE nao passa pela RLS.
revoke truncate,delete,trigger,references on
  public.receivables,public.receivable_receipts,public.receivable_adjustments,
  public.payment_charges,public.client_credits,public.institutional_contracts,
  public.contract_documents,public.contract_amendments,public.contract_commitment_orders,
  public.billing_message_logs, public.billing_provider_settings
from public,anon,authenticated;

-- Ninguem altera chaves, ambiente, boleto ou Pix pelo Data API sem ser admin/owner.
drop policy if exists billing_provider_settings_staff_select on public.billing_provider_settings;
create policy finance_provider_select on public.billing_provider_settings
for select to authenticated using ((select public.staff_can_see_module('financeiro')));
drop policy if exists billing_provider_settings_staff_update on public.billing_provider_settings;
create policy finance_provider_update on public.billing_provider_settings
for update to authenticated
using ((select public.is_active_admin_or_owner()))
with check ((select public.is_active_admin_or_owner()));

-- Creditos financeiros nao podem ser criados arbitrariamente pelo operador
-- (o fluxo de excesso requer transacao atomica futura; excedentes dos
-- operadores sao rejeitados ANTES de registrar parcialmente o pagamento).
drop policy if exists finance_client_credits_insert on public.client_credits;
create policy finance_client_credits_insert on public.client_credits
for insert to authenticated with check ((select public.is_active_admin_or_owner()));
