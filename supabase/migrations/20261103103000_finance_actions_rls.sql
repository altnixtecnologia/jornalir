-- Auditoria da RLS: políticas permissivas antigas ('..._staff') não
-- podem coexistir com novas políticas, pois RLS permissiva combina via OR.
-- Esta migração substitui as políticas das tabelas financeiras existentes.
-- Pré-requisitos: migrations 20261102100000 e 20261103100000.
-- NÃO aplicar em produção antes da homologação de operadores e webhooks.
--
-- Conexões service_role do Asaas continuam capazes de operar com bypassrls
-- autorizado; usuários autenticados obedecem as funções por ação.

-- receivables
drop policy if exists finance_read_requires_module on public.receivables;
drop policy if exists receivables_select_staff on public.receivables;
create policy receivables_select_staff on public.receivables for select to authenticated using (public.staff_can_see_module('financeiro'));
drop policy if exists receivables_insert_staff on public.receivables;
create policy receivables_insert_staff on public.receivables for insert to authenticated with check (public.staff_can_finance_action('titulos_criar'));
drop policy if exists receivables_update_staff on public.receivables;
create policy receivables_update_staff on public.receivables for update to authenticated using ((public.staff_can_finance_action('titulos_editar') or public.staff_can_finance_action('titulos_cancelar') or public.staff_can_finance_action('titulos_reabrir') or public.staff_can_finance_action('recebimentos_baixar') or public.staff_can_finance_action('recebimentos_quitar_diferenca') or public.staff_can_finance_action('recebimentos_estornar') or public.staff_can_finance_action('ajustes_criar') or public.staff_can_finance_action('ajustes_estornar') or public.staff_can_finance_action('creditos_aplicar') or public.staff_can_finance_action('titulos_criar'))) with check ((public.staff_can_finance_action('titulos_editar') or public.staff_can_finance_action('titulos_cancelar') or public.staff_can_finance_action('titulos_reabrir') or public.staff_can_finance_action('recebimentos_baixar') or public.staff_can_finance_action('recebimentos_quitar_diferenca') or public.staff_can_finance_action('recebimentos_estornar') or public.staff_can_finance_action('ajustes_criar') or public.staff_can_finance_action('ajustes_estornar') or public.staff_can_finance_action('creditos_aplicar') or public.staff_can_finance_action('titulos_criar')));

-- receivable_receipts
drop policy if exists finance_read_requires_module on public.receivable_receipts;
drop policy if exists receivable_receipts_select_staff on public.receivable_receipts;
create policy receivable_receipts_select_staff on public.receivable_receipts for select to authenticated using (public.staff_can_see_module('financeiro'));
drop policy if exists receivable_receipts_insert_staff on public.receivable_receipts;
create policy receivable_receipts_insert_staff on public.receivable_receipts for insert to authenticated with check ((public.staff_can_finance_action('recebimentos_baixar') or public.staff_can_finance_action('recebimentos_quitar_diferenca')));
drop policy if exists receivable_receipts_update_staff on public.receivable_receipts;
create policy receivable_receipts_update_staff on public.receivable_receipts for update to authenticated using (public.staff_can_finance_action('recebimentos_estornar')) with check (public.staff_can_finance_action('recebimentos_estornar'));

-- receivable_adjustments
drop policy if exists finance_read_requires_module on public.receivable_adjustments;
drop policy if exists receivable_adjustments_select_staff on public.receivable_adjustments;
create policy receivable_adjustments_select_staff on public.receivable_adjustments for select to authenticated using (public.staff_can_see_module('financeiro'));
drop policy if exists receivable_adjustments_insert_staff on public.receivable_adjustments;
create policy receivable_adjustments_insert_staff on public.receivable_adjustments for insert to authenticated with check ((public.staff_can_finance_action('ajustes_criar') or public.staff_can_finance_action('recebimentos_quitar_diferenca') or public.staff_can_finance_action('creditos_aplicar') or public.staff_can_finance_action('titulos_criar')));
drop policy if exists receivable_adjustments_update_staff on public.receivable_adjustments;
create policy receivable_adjustments_update_staff on public.receivable_adjustments for update to authenticated using (public.staff_can_finance_action('ajustes_estornar')) with check (public.staff_can_finance_action('ajustes_estornar'));

-- payment_charges
drop policy if exists finance_read_requires_module on public.payment_charges;
drop policy if exists payment_charges_select_staff on public.payment_charges;
create policy payment_charges_select_staff on public.payment_charges for select to authenticated using (public.staff_can_see_module('financeiro'));
drop policy if exists payment_charges_insert_staff on public.payment_charges;
create policy payment_charges_insert_staff on public.payment_charges for insert to authenticated with check (public.staff_can_finance_action('pix_gerar'));
drop policy if exists payment_charges_update_staff on public.payment_charges;
create policy payment_charges_update_staff on public.payment_charges for update to authenticated using ((public.staff_can_finance_action('pix_gerar') or public.staff_can_finance_action('pix_cancelar') or public.staff_can_finance_action('recebimentos_baixar'))) with check ((public.staff_can_finance_action('pix_gerar') or public.staff_can_finance_action('pix_cancelar') or public.staff_can_finance_action('recebimentos_baixar')));

-- client_credits
drop policy if exists finance_read_requires_module on public.client_credits;
drop policy if exists client_credits_select_staff on public.client_credits;
create policy client_credits_select_staff on public.client_credits for select to authenticated using (public.staff_can_see_module('financeiro'));
drop policy if exists client_credits_insert_staff on public.client_credits;
create policy client_credits_insert_staff on public.client_credits for insert to authenticated with check (public.staff_can_finance_action('recebimentos_baixar'));
drop policy if exists client_credits_update_staff on public.client_credits;
create policy client_credits_update_staff on public.client_credits for update to authenticated using (public.staff_can_finance_action('recebimentos_estornar')) with check (public.staff_can_finance_action('recebimentos_estornar'));

-- institutional_contracts
drop policy if exists finance_read_requires_module on public.institutional_contracts;
drop policy if exists institutional_contracts_select_staff on public.institutional_contracts;
create policy institutional_contracts_select_staff on public.institutional_contracts for select to authenticated using (public.staff_can_see_module('financeiro'));
drop policy if exists institutional_contracts_insert_staff on public.institutional_contracts;
create policy institutional_contracts_insert_staff on public.institutional_contracts for insert to authenticated with check (public.staff_can_finance_action('contratos_criar'));
drop policy if exists institutional_contracts_update_staff on public.institutional_contracts;
create policy institutional_contracts_update_staff on public.institutional_contracts for update to authenticated using (public.staff_can_finance_action('contratos_editar')) with check (public.staff_can_finance_action('contratos_editar'));

-- contract_documents
drop policy if exists finance_read_requires_module on public.contract_documents;
drop policy if exists contract_documents_select_staff on public.contract_documents;
create policy contract_documents_select_staff on public.contract_documents for select to authenticated using (public.staff_can_see_module('financeiro'));
drop policy if exists contract_documents_insert_staff on public.contract_documents;
create policy contract_documents_insert_staff on public.contract_documents for insert to authenticated with check ((public.staff_can_finance_action('contratos_criar') or public.staff_can_finance_action('contratos_editar')));

-- contract_amendments
drop policy if exists finance_read_requires_module on public.contract_amendments;
drop policy if exists contract_amendments_select_staff on public.contract_amendments;
create policy contract_amendments_select_staff on public.contract_amendments for select to authenticated using (public.staff_can_see_module('financeiro'));
drop policy if exists contract_amendments_insert_staff on public.contract_amendments;
create policy contract_amendments_insert_staff on public.contract_amendments for insert to authenticated with check (public.staff_can_finance_action('contratos_editar'));

-- contract_commitment_orders
drop policy if exists finance_read_requires_module on public.contract_commitment_orders;
drop policy if exists contract_commitment_orders_select_staff on public.contract_commitment_orders;
create policy contract_commitment_orders_select_staff on public.contract_commitment_orders for select to authenticated using (public.staff_can_see_module('financeiro'));
drop policy if exists contract_commitment_orders_insert_staff on public.contract_commitment_orders;
create policy contract_commitment_orders_insert_staff on public.contract_commitment_orders for insert to authenticated with check (public.staff_can_finance_action('contratos_editar'));

-- contract_templates
drop policy if exists finance_read_requires_module on public.contract_templates;
drop policy if exists contract_templates_select_staff on public.contract_templates;
create policy contract_templates_select_staff on public.contract_templates for select to authenticated using (public.staff_can_see_module('financeiro'));
drop policy if exists contract_templates_insert_staff on public.contract_templates;
create policy contract_templates_insert_staff on public.contract_templates for insert to authenticated with check (public.staff_can_finance_action('contratos_editar'));

-- billing_message_logs
drop policy if exists finance_read_requires_module on public.billing_message_logs;
drop policy if exists billing_message_logs_select_staff on public.billing_message_logs;
create policy billing_message_logs_select_staff on public.billing_message_logs for select to authenticated using (public.staff_can_see_module('financeiro'));
drop policy if exists billing_message_logs_insert_staff on public.billing_message_logs;
create policy billing_message_logs_insert_staff on public.billing_message_logs for insert to authenticated with check (public.staff_can_finance_action('pix_enviar'));

-- billing_provider_settings
drop policy if exists finance_read_requires_module on public.billing_provider_settings;
drop policy if exists billing_provider_settings_select_staff on public.billing_provider_settings;
drop policy if exists billing_provider_settings_staff_select on public.billing_provider_settings;
create policy billing_provider_settings_select_staff on public.billing_provider_settings for select to authenticated using (public.staff_can_see_module('financeiro'));
drop policy if exists billing_provider_settings_update_staff on public.billing_provider_settings;
drop policy if exists billing_provider_settings_staff_update on public.billing_provider_settings;
create policy billing_provider_settings_update_staff on public.billing_provider_settings for update to authenticated using (public.is_active_admin_or_owner()) with check (public.is_active_admin_or_owner());

-- billing_webhook_events
drop policy if exists finance_read_requires_module on public.billing_webhook_events;
drop policy if exists billing_webhook_events_select_staff on public.billing_webhook_events;
drop policy if exists billing_webhook_events_staff_select on public.billing_webhook_events;
create policy billing_webhook_events_select_staff on public.billing_webhook_events for select to authenticated using (public.staff_can_see_module('financeiro'));

-- ALTERAÇÃO DE STATUS NÃO É EQUIVALENTE A EDITAR O TÍTULO.
-- Mesmo uma autorização para dar baixa não pode mudar preço, cliente
-- ou vencimento por chamada REST direta.
create or replace function public.enforce_receivable_action_updates()
returns trigger language plpgsql set search_path=''
as $$
declare
  v_received numeric := 0;
  v_adjusted numeric := 0;
  v_balance numeric := 0;
begin
  if (select auth.uid()) is null or public.is_active_admin_or_owner() then
    return new;
  end if;

  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from
      (to_jsonb(old) - 'status' - 'updated_at') and
      not public.staff_can_finance_action('titulos_editar') then
    raise exception 'Sem permissão para editar dados do título.' using errcode='42501';
  end if;

  if new.status is distinct from old.status then
    if new.status='cancelled' then
      if not public.staff_can_finance_action('titulos_cancelar') then
        raise exception 'Sem permissão para cancelar título.' using errcode='42501';
      end if;
    elsif old.status='cancelled' then
      if not public.staff_can_finance_action('titulos_reabrir') then
        raise exception 'Sem permissão para reabrir título.' using errcode='42501';
      end if;
    else
      if not (
        public.staff_can_finance_action('recebimentos_baixar')
        or public.staff_can_finance_action('recebimentos_quitar_diferenca')
        or public.staff_can_finance_action('recebimentos_estornar')
        or public.staff_can_finance_action('ajustes_criar')
        or public.staff_can_finance_action('ajustes_estornar')
        or public.staff_can_finance_action('creditos_aplicar')
        or public.staff_can_finance_action('titulos_criar')
      ) then
        raise exception 'Sem permissão para alterar situação financeira.' using errcode='42501';
      end if;
    end if;

    if new.status in ('open','partially_paid','paid') then
      select coalesce(sum(amount),0) into v_received
        from public.receivable_receipts where receivable_id=new.id and reversed_at is null;
      select coalesce(sum(amount),0) into v_adjusted
        from public.receivable_adjustments where receivable_id=new.id and reversed_at is null;
      v_balance := new.original_amount-v_received-v_adjusted;
      if (new.status='paid' and v_balance>0.005)
        or (new.status='partially_paid' and (v_balance<=0.005 or v_balance>=new.original_amount-0.005))
        or (new.status='open' and v_balance<new.original_amount-0.005) then
        raise exception 'Situação não corresponde ao saldo registrado.' using errcode='23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists receivables_guard_finance_action on public.receivables;
create trigger receivables_guard_finance_action before update on public.receivables
for each row execute function public.enforce_receivable_action_updates();

-- Não permitir que operador com permissão de estornar altere valor
-- ou beneficiário de recebimentos/ajustes antigos.
create or replace function public.enforce_financial_reversal_only()
returns trigger language plpgsql set search_path=''
as $$
begin
  if (select auth.uid()) is null or public.is_active_admin_or_owner() then
    return new;
  end if;
  if (to_jsonb(new) - 'reversed_at' - 'reversed_by' - 'reversal_reason') is distinct from
      (to_jsonb(old) - 'reversed_at' - 'reversed_by' - 'reversal_reason')
      or old.reversed_at is not null
      or new.reversed_at is null
      or nullif(btrim(new.reversal_reason),'') is null then
    raise exception 'Somente estorno justificado é permitido.' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists receivable_receipts_guard_reversal on public.receivable_receipts;
create trigger receivable_receipts_guard_reversal
before update on public.receivable_receipts for each row
execute function public.enforce_financial_reversal_only();
drop trigger if exists receivable_adjustments_guard_reversal on public.receivable_adjustments;
create trigger receivable_adjustments_guard_reversal
before update on public.receivable_adjustments for each row
execute function public.enforce_financial_reversal_only();

-- Impedir troca de valor, cliente ou título de uma cobrança Pix existente,
-- inclusive quando o operador pode gerar ou cancelar cobranças.
create or replace function public.enforce_payment_charge_updates()
returns trigger language plpgsql set search_path=''
as $$
begin
  if (select auth.uid()) is null or public.is_active_admin_or_owner() then
    return new;
  end if;
  if new.amount is distinct from old.amount
    or new.client_id is distinct from old.client_id
    or new.receivable_id is distinct from old.receivable_id
    or new.provider is distinct from old.provider then
    raise exception 'Dados originais da cobrança são imutáveis.' using errcode='42501';
  end if;
  if new.status is distinct from old.status then
    if new.status='cancelled' and not public.staff_can_finance_action('pix_cancelar') then
      raise exception 'Sem permissão para cancelar Pix.' using errcode='42501';
    elsif new.status='paid' and not public.staff_can_finance_action('recebimentos_baixar') then
      raise exception 'Sem permissão para confirmar pagamento.' using errcode='42501';
    elsif new.status not in ('cancelled','paid') then
      raise exception 'Transição de cobrança indisponível.' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists payment_charges_guard_action on public.payment_charges;
create trigger payment_charges_guard_action before update on public.payment_charges
for each row execute function public.enforce_payment_charge_updates();

-- Não permitir criar títulos já pagos/cancelados diretamente pela API:
-- seus saldos/estornos precisam ter documentação no livro financeiro.
create or replace function public.enforce_receivable_insert_state()
returns trigger language plpgsql set search_path=''
as $$
begin
  if (select auth.uid()) is not null
    and not public.is_active_admin_or_owner()
    and new.status <> 'open' then
    raise exception 'Novo título deve iniciar em aberto.' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists receivables_guard_initial_state on public.receivables;
create trigger receivables_guard_initial_state before insert on public.receivables
for each row execute function public.enforce_receivable_insert_state();

-- Registrar recebimento requer saldo e um título não cancelado.
-- Bloqueio do título evita dois lançamentos concorrentes acima do saldo.
create or replace function public.enforce_receipt_insert_balance()
returns trigger language plpgsql set search_path=''
as $$
declare
  v_receivable public.receivables%rowtype;
  v_received numeric;
  v_adjusted numeric;
begin
  if (select auth.uid()) is null or public.is_active_admin_or_owner() then
    return new;
  end if;
  if new.amount is null or new.amount<=0 or new.reversed_at is not null then
    raise exception 'Recebimento inválido.' using errcode='23514';
  end if;
  select * into v_receivable from public.receivables
    where id=new.receivable_id for update;
  if v_receivable.id is null or v_receivable.status='cancelled' then
    raise exception 'Título inválido para recebimento.' using errcode='42501';
  end if;
  select coalesce(sum(amount),0) into v_received from public.receivable_receipts
    where receivable_id=new.receivable_id and reversed_at is null;
  select coalesce(sum(amount),0) into v_adjusted from public.receivable_adjustments
    where receivable_id=new.receivable_id and reversed_at is null;
  if new.amount > v_receivable.original_amount-v_received-v_adjusted+0.005 then
    raise exception 'Recebimento acima do saldo: use o fluxo de crédito excedente.' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists receivable_receipts_guard_amount on public.receivable_receipts;
create trigger receivable_receipts_guard_amount before insert on public.receivable_receipts
for each row execute function public.enforce_receipt_insert_balance();

-- Proteção adicional dos créditos: não reescrever origem, valor ou cliente
-- de crédito existente por UPDATE direto.
create or replace function public.enforce_credit_reversal_only()
returns trigger language plpgsql set search_path=''
as $$
begin
  if (select auth.uid()) is null or public.is_active_admin_or_owner() then
    return new;
  end if;
  if (to_jsonb(new) - 'reversed_at' - 'reversed_by' - 'reversal_reason') is distinct from
      (to_jsonb(old) - 'reversed_at' - 'reversed_by' - 'reversal_reason')
      or old.reversed_at is not null
      or new.reversed_at is null
      or nullif(btrim(new.reversal_reason),'') is null then
    raise exception 'Crédito imutável; somente estorno justificado é permitido.' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists client_credits_guard_reversal on public.client_credits;
create trigger client_credits_guard_reversal before update on public.client_credits
for each row execute function public.enforce_credit_reversal_only();


-- Aplicação de crédito passa por validação de origem, saldo e tipo de ajuste.
-- Criar título não concede o direito de conceder desconto avulso.
create or replace function public.enforce_adjustment_insert_rules()
returns trigger language plpgsql set search_path=''
as $$
declare
  v_receivable public.receivables%rowtype;
  v_credit public.client_credits%rowtype;
  v_used numeric := 0;
  v_receipts numeric := 0;
  v_adjustments numeric := 0;
begin
  if (select auth.uid()) is null or public.is_active_admin_or_owner() then
    return new;
  end if;
  if new.amount is null or new.amount<=0 or new.reversed_at is not null then
    raise exception 'Ajuste financeiro inválido.' using errcode='23514';
  end if;

  if new.adjustment_type='credit_applied' then
    if not (public.staff_can_finance_action('creditos_aplicar')
      or public.staff_can_finance_action('titulos_criar')) then
      raise exception 'Sem permissão para aplicar crédito.' using errcode='42501';
    end if;
    if new.credit_id is null then
      raise exception 'Ajuste de crédito exige referência ao crédito.' using errcode='23514';
    end if;
    -- A RPC aplica crédito sob lock nesta mesma ordem.
    select * into v_credit from public.client_credits
      where id=new.credit_id for update;
    if v_credit.id is null or v_credit.reversed_at is not null then
      raise exception 'Crédito inválido/estornado.' using errcode='23514';
    end if;
    select coalesce(sum(amount),0) into v_used
      from public.receivable_adjustments
      where credit_id=new.credit_id and reversed_at is null;
    if v_used+new.amount>v_credit.original_amount+0.005 then
      raise exception 'Valor supera o saldo do crédito.' using errcode='23514';
    end if;
  elsif new.adjustment_type='settlement_difference' then
    if not public.staff_can_finance_action('recebimentos_quitar_diferenca') then
      raise exception 'Sem permissão para quitar com diferença.' using errcode='42501';
    end if;
  elsif not public.staff_can_finance_action('ajustes_criar') then
    raise exception 'Sem permissão para criar ajustes/descontos.' using errcode='42501';
  end if;

  select * into v_receivable from public.receivables
    where id=new.receivable_id for update;
  if v_receivable.id is null or v_receivable.status='cancelled' then
    raise exception 'Título inválido para ajuste.' using errcode='42501';
  end if;
  if new.adjustment_type='credit_applied' and
     v_credit.client_id is distinct from v_receivable.client_id then
    raise exception 'Crédito pertence a outro cliente.' using errcode='23514';
  end if;
  select coalesce(sum(amount),0) into v_receipts
    from public.receivable_receipts
    where receivable_id=new.receivable_id and reversed_at is null;
  select coalesce(sum(amount),0) into v_adjustments
    from public.receivable_adjustments
    where receivable_id=new.receivable_id and reversed_at is null;
  if new.amount>v_receivable.original_amount-v_receipts-v_adjustments+0.005 then
    raise exception 'Ajuste acima do saldo.' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists receivable_adjustments_guard_insert on public.receivable_adjustments;
create trigger receivable_adjustments_guard_insert before insert on public.receivable_adjustments
for each row execute function public.enforce_adjustment_insert_rules();

create or replace function public.enforce_payment_charge_insert_state()
returns trigger language plpgsql set search_path=''
as $$
begin
  if (select auth.uid()) is not null
    and not public.is_active_admin_or_owner()
    and (new.status<>'pending' or new.amount is null or new.amount<=0) then
    raise exception 'Nova cobrança deve iniciar pendente e com valor positivo.' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists payment_charges_guard_initial_state on public.payment_charges;
create trigger payment_charges_guard_initial_state before insert on public.payment_charges
for each row execute function public.enforce_payment_charge_insert_state();

-- Verificação de instalação: erro em caso de política antiga ainda presente
-- nos 13 recursos financeiros protegidos acima.
do $audit$
declare
  v_count integer;
begin
  select count(*) into v_count
    from pg_policies
    where schemaname='public'
      and tablename = any(array['receivables','receivable_receipts','receivable_adjustments','payment_charges','client_credits','institutional_contracts','contract_documents','contract_amendments','contract_commitment_orders','contract_templates','billing_message_logs','billing_provider_settings','billing_webhook_events'])
      and (qual = 'is_active_staff()' or with_check = 'is_active_staff()');
  if v_count>0 then
    raise exception 'RLS financeira incompleta: % políticas amplas permaneceram.',v_count;
  end if;
end;
$audit$;
