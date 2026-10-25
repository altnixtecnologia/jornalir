-- Reforço de RLS por ação para Clientes, Assinaturas e Comercial/LED.
-- Substitui as políticas permissivas antigas (que combinam via OR).
-- Requer migrações 20261102100000 e 20261103100000 de convites/matriz.
-- Não aplicar à produção sem homologar RPC save_client e gatilhos,
-- integrações automáticas e rotas que acessam estas tabelas.

-- clients
drop policy if exists clients_select_staff on public.clients;
create policy clients_select_staff on public.clients for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('clientes') or public.staff_can_see_module('assinaturas') or public.staff_can_see_module('publicidade') or public.staff_can_see_module('financeiro') or public.staff_can_see_module('nfse'))));
drop policy if exists clients_insert_staff on public.clients;
create policy clients_insert_staff on public.clients for INSERT to authenticated with check ((public.is_active_staff() and (public.staff_can_module_action('clientes','clientes_criar'))));
drop policy if exists clients_update_staff on public.clients;
create policy clients_update_staff on public.clients for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('clientes','clientes_editar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('clientes','clientes_editar'))));
drop policy if exists clients_delete_staff on public.clients;

-- client_roles
drop policy if exists client_roles_select_staff on public.client_roles;
create policy client_roles_select_staff on public.client_roles for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('clientes') or public.staff_can_see_module('assinaturas') or public.staff_can_see_module('publicidade') or public.staff_can_see_module('financeiro'))));
drop policy if exists client_roles_insert_staff on public.client_roles;
create policy client_roles_insert_staff on public.client_roles for INSERT to authenticated with check ((public.is_active_staff() and (public.staff_can_module_action('clientes','clientes_criar') or public.staff_can_module_action('clientes','clientes_editar')
  or (role='assinante' and public.staff_can_module_action('assinaturas','assinaturas_criar'))
  or (role='anunciante' and (public.staff_can_module_action('publicidade','vendas_criar')
    or public.staff_can_module_action('publicidade','propostas_aprovar'))))));
drop policy if exists client_roles_update_staff on public.client_roles;
create policy client_roles_update_staff on public.client_roles for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('clientes','clientes_editar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('clientes','clientes_editar'))));
drop policy if exists client_roles_delete_staff on public.client_roles;
create policy client_roles_delete_staff on public.client_roles for DELETE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('clientes','clientes_editar'))));

-- subscriptions
drop policy if exists subscriptions_select_staff on public.subscriptions;
create policy subscriptions_select_staff on public.subscriptions for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('assinaturas') or public.staff_can_see_module('financeiro'))));
drop policy if exists subscriptions_insert_staff on public.subscriptions;
create policy subscriptions_insert_staff on public.subscriptions for INSERT to authenticated with check ((public.is_active_staff() and (public.staff_can_module_action('assinaturas','assinaturas_criar'))));
drop policy if exists subscriptions_update_staff on public.subscriptions;
create policy subscriptions_update_staff on public.subscriptions for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('assinaturas','assinaturas_editar') or public.staff_can_module_action('assinaturas','assinaturas_suspender') or public.staff_can_module_action('assinaturas','assinaturas_cancelar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('assinaturas','assinaturas_editar') or public.staff_can_module_action('assinaturas','assinaturas_suspender') or public.staff_can_module_action('assinaturas','assinaturas_cancelar'))));
drop policy if exists subscriptions_delete_staff on public.subscriptions;

-- commercial_products
drop policy if exists commercial_products_select_staff on public.commercial_products;
create policy commercial_products_select_staff on public.commercial_products for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('publicidade') or public.staff_can_see_module('financeiro'))));
drop policy if exists commercial_products_insert_staff on public.commercial_products;
create policy commercial_products_insert_staff on public.commercial_products for INSERT to authenticated with check ((public.is_active_staff() and (public.staff_can_module_action('publicidade','produtos_gerenciar'))));
drop policy if exists commercial_products_update_staff on public.commercial_products;
create policy commercial_products_update_staff on public.commercial_products for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('publicidade','produtos_gerenciar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('publicidade','produtos_gerenciar'))));
drop policy if exists commercial_products_delete_staff on public.commercial_products;

-- commercial_proposals
drop policy if exists commercial_proposals_select_staff on public.commercial_proposals;
create policy commercial_proposals_select_staff on public.commercial_proposals for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('publicidade'))));
drop policy if exists commercial_proposals_insert_staff on public.commercial_proposals;
create policy commercial_proposals_insert_staff on public.commercial_proposals for INSERT to authenticated with check ((public.is_active_staff() and (public.staff_can_module_action('publicidade','propostas_criar'))));
drop policy if exists commercial_proposals_update_staff on public.commercial_proposals;
create policy commercial_proposals_update_staff on public.commercial_proposals for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('publicidade','propostas_editar') or public.staff_can_module_action('publicidade','propostas_aprovar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('publicidade','propostas_editar') or public.staff_can_module_action('publicidade','propostas_aprovar'))));
drop policy if exists commercial_proposals_delete_staff on public.commercial_proposals;

-- commercial_proposal_items
drop policy if exists commercial_proposal_items_select_staff on public.commercial_proposal_items;
create policy commercial_proposal_items_select_staff on public.commercial_proposal_items for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('publicidade'))));
drop policy if exists commercial_proposal_items_insert_staff on public.commercial_proposal_items;
create policy commercial_proposal_items_insert_staff on public.commercial_proposal_items for INSERT to authenticated with check ((public.is_active_staff() and (public.staff_can_module_action('publicidade','propostas_criar') or public.staff_can_module_action('publicidade','propostas_editar'))));
drop policy if exists commercial_proposal_items_update_staff on public.commercial_proposal_items;
create policy commercial_proposal_items_update_staff on public.commercial_proposal_items for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('publicidade','propostas_editar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('publicidade','propostas_editar'))));
drop policy if exists commercial_proposal_items_delete_staff on public.commercial_proposal_items;
create policy commercial_proposal_items_delete_staff on public.commercial_proposal_items for DELETE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('publicidade','propostas_editar'))));

-- commercial_sales
drop policy if exists commercial_sales_select_staff on public.commercial_sales;
create policy commercial_sales_select_staff on public.commercial_sales for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('publicidade') or public.staff_can_see_module('financeiro'))));
drop policy if exists commercial_sales_insert_staff on public.commercial_sales;
create policy commercial_sales_insert_staff on public.commercial_sales for INSERT to authenticated with check ((public.is_active_staff() and (public.staff_can_module_action('publicidade','vendas_criar') or public.staff_can_module_action('publicidade','propostas_aprovar'))));
drop policy if exists commercial_sales_update_staff on public.commercial_sales;
create policy commercial_sales_update_staff on public.commercial_sales for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('publicidade','vendas_editar') or public.staff_can_module_action('publicidade','vendas_cancelar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('publicidade','vendas_editar') or public.staff_can_module_action('publicidade','vendas_cancelar'))));
drop policy if exists commercial_sales_delete_staff on public.commercial_sales;

-- Não permitir alterar condições de assinatura usando permissão apenas
-- de suspender/cancelar. Alterações combinadas exigem ambos os direitos.
create or replace function public.enforce_subscription_actions()
returns trigger language plpgsql set search_path=''
as $$
begin
  if (select auth.uid()) is null or public.is_active_admin_or_owner() then return new; end if;
  if (to_jsonb(new) - 'status' - 'updated_at' - 'cancelled_at' - 'cancellation_reason')
    is distinct from (to_jsonb(old) - 'status' - 'updated_at' - 'cancelled_at' - 'cancellation_reason')
    and not public.staff_can_module_action('assinaturas','assinaturas_editar') then
    raise exception 'Sem permissão para alterar o plano/valor/prazos.' using errcode='42501';
  end if;
  if new.status is distinct from old.status then
    if old.status='cancelled' then
      raise exception 'Assinatura cancelada não pode ser reativada.' using errcode='42501';
    elsif new.status='cancelled' then
      if not public.staff_can_module_action('assinaturas','assinaturas_cancelar') then
        raise exception 'Sem permissão para cancelar assinatura.' using errcode='42501';
      end if;
    elsif new.status in ('active','suspended') then
      if not public.staff_can_module_action('assinaturas','assinaturas_suspender') then
        raise exception 'Sem permissão para suspender/reativar assinatura.' using errcode='42501';
      end if;
    else
      raise exception 'Situação inválida da assinatura.' using errcode='23514';
    end if;
  elsif (new.cancelled_at is distinct from old.cancelled_at
      or new.cancellation_reason is distinct from old.cancellation_reason)
      and not public.staff_can_module_action('assinaturas','assinaturas_editar') then
      raise exception 'Sem permissão para alterar cancelamento.' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists subscriptions_guard_actions on public.subscriptions;
create trigger subscriptions_guard_actions before update on public.subscriptions
for each row execute function public.enforce_subscription_actions();

-- Evita aprovar proposta sem direito específico, além de impedir que
-- autorização de aprovar permita mexer em preço/cliente.
create or replace function public.enforce_commercial_proposal_actions()
returns trigger language plpgsql set search_path=''
as $$
begin
  -- Mesmo lock dos itens: aprovação e edição de itens não se cruzam.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.id::text,8371));
  if (select auth.uid()) is null or public.is_active_admin_or_owner() then return new; end if;
  if (to_jsonb(new) - 'status' - 'converted_sale_id' - 'updated_by' - 'updated_at')
    is distinct from (to_jsonb(old) - 'status' - 'converted_sale_id' - 'updated_by' - 'updated_at')
    and not public.staff_can_module_action('publicidade','propostas_editar') then
    raise exception 'Sem permissão para editar condições da proposta.' using errcode='42501';
  end if;
  if new.status is distinct from old.status then
    if not (
      (old.status='draft' and new.status in ('sent','approved','rejected','archived'))
      or (old.status='sent' and new.status in ('approved','rejected','archived'))
      or (old.status in ('approved','rejected') and new.status='archived')
    ) then
      raise exception 'Transição de proposta não permitida.' using errcode='23514';
    end if;
    if new.status='approved' then
      if not public.staff_can_module_action('publicidade','propostas_aprovar') then
        raise exception 'Sem permissão para aprovar proposta.' using errcode='42501';
      end if;
    elsif not public.staff_can_module_action('publicidade','propostas_editar') then
      raise exception 'Sem permissão para alterar situação da proposta.' using errcode='42501';
    end if;
  end if;
  if new.converted_sale_id is distinct from old.converted_sale_id then
    if old.converted_sale_id is not null or new.converted_sale_id is null
      or new.status <> 'approved'
      or not public.staff_can_module_action('publicidade','propostas_aprovar') then
      raise exception 'Conversão de proposta não autorizada.' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists commercial_proposals_guard_actions on public.commercial_proposals;
create trigger commercial_proposals_guard_actions before update on public.commercial_proposals
for each row execute function public.enforce_commercial_proposal_actions();

-- Os itens só podem ser editados enquanto a proposta está em negociação.
-- Trava o pai para não haver corrida entre aprovação e substituição de itens.
create or replace function public.enforce_proposal_item_actions()
returns trigger language plpgsql set search_path=''
as $$
declare v_parent public.commercial_proposals%rowtype;
begin
  if (select auth.uid()) is null or public.is_active_admin_or_owner() then return coalesce(new,old); end if;
  -- Lock transacional compatível com permissão somente de CRIAR;
  -- SELECT FOR UPDATE exigiria política de UPDATE no cabeçalho.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    (case when TG_OP='DELETE' then old.proposal_id else new.proposal_id end)::text,8371));
  select * into v_parent from public.commercial_proposals
    where id=case when TG_OP='DELETE' then old.proposal_id else new.proposal_id end;
  if v_parent.id is null or v_parent.status not in ('draft','sent') then
    raise exception 'Itens de proposta aprovada/arquivada não podem ser alterados.' using errcode='42501';
  end if;
  if TG_OP='INSERT' then
    if not (public.staff_can_module_action('publicidade','propostas_criar')
      or public.staff_can_module_action('publicidade','propostas_editar')) then
      raise exception 'Sem permissão para adicionar itens.' using errcode='42501';
    end if;
  elsif not public.staff_can_module_action('publicidade','propostas_editar') then
    raise exception 'Sem permissão para editar/remover itens.' using errcode='42501';
  end if;
  if TG_OP='UPDATE' and old.proposal_id is distinct from new.proposal_id then
    raise exception 'Não é permitido mover um item entre propostas.' using errcode='42501';
  end if;
  return coalesce(new,old);
end;
$$;
drop trigger if exists commercial_proposal_items_guard_actions on public.commercial_proposal_items;
create trigger commercial_proposal_items_guard_actions
before insert or update or delete on public.commercial_proposal_items
for each row execute function public.enforce_proposal_item_actions();

create or replace function public.enforce_commercial_sale_actions()
returns trigger language plpgsql set search_path=''
as $$
begin
  if (select auth.uid()) is null or public.is_active_admin_or_owner() then return new; end if;
  if (to_jsonb(new) - 'status' - 'updated_by' - 'updated_at')
    is distinct from (to_jsonb(old) - 'status' - 'updated_by' - 'updated_at')
    and not public.staff_can_module_action('publicidade','vendas_editar') then
    raise exception 'Sem permissão para alterar preço, prazo ou cliente da venda.' using errcode='42501';
  end if;
  if new.proposal_id is distinct from old.proposal_id then
    raise exception 'Origem da venda é imutável.' using errcode='42501';
  end if;
  if new.status is distinct from old.status then
    if not (
      (old.status='proposal' and new.status in ('approved','active','cancelled'))
      or (old.status='approved' and new.status in ('active','completed','cancelled'))
      or (old.status='active' and new.status in ('completed','cancelled'))
      or (old.status='completed' and new.status='cancelled')
    ) then
      raise exception 'Transição de venda não permitida.' using errcode='23514';
    end if;
    if old.status='cancelled' then
      raise exception 'Venda cancelada não pode ser reativada.' using errcode='42501';
    elsif new.status='cancelled' then
      if not public.staff_can_module_action('publicidade','vendas_cancelar') then
        raise exception 'Sem permissão para cancelar venda.' using errcode='42501';
      end if;
    elsif not public.staff_can_module_action('publicidade','vendas_editar') then
      raise exception 'Sem permissão para alterar status da venda.' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists commercial_sales_guard_actions on public.commercial_sales;
create trigger commercial_sales_guard_actions before update on public.commercial_sales
for each row execute function public.enforce_commercial_sale_actions();

-- Client roles inseridos automaticamente por assinatura ou venda continuam
-- possíveis sem conceder poder de editar dados cadastrais do cliente.
-- Revogar somente as permissões realmente antigas; não derrubar políticas
-- adicionais de serviço.
do $audit$
declare v_count int;
begin
 select count(*) into v_count from pg_policies
 where schemaname='public'
   and tablename = any(array['clients','client_roles','subscriptions','commercial_products',
   'commercial_proposals','commercial_proposal_items','commercial_sales'])
   and (qual='is_active_staff()' or with_check='is_active_staff()');
 if v_count>0 then
   raise exception 'RLS comercial/assinaturas/clientes incompleta: % políticas antigas',v_count;
 end if;
end;
$audit$;
