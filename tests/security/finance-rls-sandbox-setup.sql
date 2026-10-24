-- PostgreSQL isolado de CI: esquema mínimo para exercitar as migrations
-- sem conectar ao Supabase do Jornal IR. Nenhum dado real é copiado.
create schema if not exists auth;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
create table public.profiles(id uuid primary key,role text,active boolean);
create table public.agenda_manager_grants(profile_id uuid,can_manage boolean);
create table public.staff_module_visibility(profile_id uuid,module_key text,enabled boolean);
create table public.staff_finance_action_permissions(profile_id uuid,action_key text,allowed boolean);
create or replace function public.has_staff_module_access(text,boolean)
returns boolean language sql stable as $$select false$$;
create or replace function public.is_active_staff()
returns boolean language sql stable as $$select true$$;
create or replace function public.is_active_admin_or_owner()
returns boolean language sql stable as $$select true$$;
create or replace function public.staff_can_see_module(text)
returns boolean language sql stable as $$select true$$;
create or replace function public.staff_can_finance_action(text)
returns boolean language sql stable as $$select true$$;

create table public.receivables (id uuid primary key, client_id uuid, original_amount numeric not null default 100, status text not null default 'open', updated_at timestamptz default now());
alter table public.receivables enable row level security;
create policy receivables_select_staff on public.receivables for select to authenticated using (public.is_active_staff());
create policy receivables_insert_staff on public.receivables for insert to authenticated with check (public.is_active_staff());
create policy receivables_update_staff on public.receivables for update to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create policy finance_read_requires_module on public.receivables for select to authenticated using (public.staff_can_see_module('financeiro'));
create table public.receivable_receipts (id uuid primary key, receivable_id uuid, amount numeric, reversed_at timestamptz, reversed_by uuid, reversal_reason text);
alter table public.receivable_receipts enable row level security;
create policy receivable_receipts_select_staff on public.receivable_receipts for select to authenticated using (public.is_active_staff());
create policy receivable_receipts_insert_staff on public.receivable_receipts for insert to authenticated with check (public.is_active_staff());
create policy receivable_receipts_update_staff on public.receivable_receipts for update to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create policy finance_read_requires_module on public.receivable_receipts for select to authenticated using (public.staff_can_see_module('financeiro'));
create table public.receivable_adjustments (id uuid primary key, receivable_id uuid, amount numeric, adjustment_type text, credit_id uuid, reversed_at timestamptz, reversed_by uuid, reversal_reason text);
alter table public.receivable_adjustments enable row level security;
create policy receivable_adjustments_select_staff on public.receivable_adjustments for select to authenticated using (public.is_active_staff());
create policy receivable_adjustments_insert_staff on public.receivable_adjustments for insert to authenticated with check (public.is_active_staff());
create policy receivable_adjustments_update_staff on public.receivable_adjustments for update to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create policy finance_read_requires_module on public.receivable_adjustments for select to authenticated using (public.staff_can_see_module('financeiro'));
create table public.payment_charges (id uuid primary key, receivable_id uuid, client_id uuid, amount numeric, provider text, status text);
alter table public.payment_charges enable row level security;
create policy payment_charges_select_staff on public.payment_charges for select to authenticated using (public.is_active_staff());
create policy payment_charges_insert_staff on public.payment_charges for insert to authenticated with check (public.is_active_staff());
create policy payment_charges_update_staff on public.payment_charges for update to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create policy finance_read_requires_module on public.payment_charges for select to authenticated using (public.staff_can_see_module('financeiro'));
create table public.client_credits (id uuid primary key, client_id uuid, original_amount numeric, reversed_at timestamptz, reversed_by uuid, reversal_reason text);
alter table public.client_credits enable row level security;
create policy client_credits_select_staff on public.client_credits for select to authenticated using (public.is_active_staff());
create policy client_credits_insert_staff on public.client_credits for insert to authenticated with check (public.is_active_staff());
create policy client_credits_update_staff on public.client_credits for update to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create policy finance_read_requires_module on public.client_credits for select to authenticated using (public.staff_can_see_module('financeiro'));
create table public.institutional_contracts (id uuid primary key);
alter table public.institutional_contracts enable row level security;
create policy institutional_contracts_select_staff on public.institutional_contracts for select to authenticated using (public.is_active_staff());
create policy institutional_contracts_insert_staff on public.institutional_contracts for insert to authenticated with check (public.is_active_staff());
create policy institutional_contracts_update_staff on public.institutional_contracts for update to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create policy finance_read_requires_module on public.institutional_contracts for select to authenticated using (public.staff_can_see_module('financeiro'));
create table public.contract_documents (id uuid primary key);
alter table public.contract_documents enable row level security;
create policy contract_documents_select_staff on public.contract_documents for select to authenticated using (public.is_active_staff());
create policy contract_documents_insert_staff on public.contract_documents for insert to authenticated with check (public.is_active_staff());
create policy finance_read_requires_module on public.contract_documents for select to authenticated using (public.staff_can_see_module('financeiro'));
create table public.contract_amendments (id uuid primary key);
alter table public.contract_amendments enable row level security;
create policy contract_amendments_select_staff on public.contract_amendments for select to authenticated using (public.is_active_staff());
create policy contract_amendments_insert_staff on public.contract_amendments for insert to authenticated with check (public.is_active_staff());
create policy finance_read_requires_module on public.contract_amendments for select to authenticated using (public.staff_can_see_module('financeiro'));
create table public.contract_commitment_orders (id uuid primary key);
alter table public.contract_commitment_orders enable row level security;
create policy contract_commitment_orders_select_staff on public.contract_commitment_orders for select to authenticated using (public.is_active_staff());
create policy contract_commitment_orders_insert_staff on public.contract_commitment_orders for insert to authenticated with check (public.is_active_staff());
create policy finance_read_requires_module on public.contract_commitment_orders for select to authenticated using (public.staff_can_see_module('financeiro'));
create table public.contract_templates (id uuid primary key);
alter table public.contract_templates enable row level security;
create policy contract_templates_select_staff on public.contract_templates for select to authenticated using (public.is_active_staff());
create policy contract_templates_insert_staff on public.contract_templates for insert to authenticated with check (public.is_active_staff());
create table public.billing_message_logs (id uuid primary key);
alter table public.billing_message_logs enable row level security;
create policy billing_message_logs_select_staff on public.billing_message_logs for select to authenticated using (public.is_active_staff());
create policy billing_message_logs_insert_staff on public.billing_message_logs for insert to authenticated with check (public.is_active_staff());
create table public.billing_provider_settings (id uuid primary key);
alter table public.billing_provider_settings enable row level security;
create policy billing_provider_settings_select_staff on public.billing_provider_settings for select to authenticated using (public.is_active_staff());
create policy billing_provider_settings_staff_select on public.billing_provider_settings for select to authenticated using (public.is_active_staff());
create policy billing_provider_settings_staff_update on public.billing_provider_settings for update to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create table public.billing_webhook_events (id uuid primary key);
alter table public.billing_webhook_events enable row level security;
create policy billing_webhook_events_select_staff on public.billing_webhook_events for select to authenticated using (public.is_active_staff());
create policy billing_webhook_events_staff_select on public.billing_webhook_events for select to authenticated using (public.is_active_staff());

grant usage on schema auth,public to authenticated;
grant execute on function auth.uid() to authenticated;
grant select on auth.users to authenticated;
grant select on public.profiles,public.agenda_manager_grants,
 public.staff_module_visibility,public.staff_finance_action_permissions to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;

-- Owner ativo + operador confirmado + operador convidado não confirmado.
insert into auth.users(id,email_confirmed_at) values
 ('00000000-0000-0000-0000-000000000001', now()),
 ('00000000-0000-0000-0000-000000000002', now()),
 ('00000000-0000-0000-0000-000000000003', null);
insert into public.profiles(id,role,active) values
 ('00000000-0000-0000-0000-000000000001','owner',true),
 ('00000000-0000-0000-0000-000000000002','operator',true),
 ('00000000-0000-0000-0000-000000000003','operator',true);
insert into public.staff_module_visibility(profile_id,module_key,enabled) values
 ('00000000-0000-0000-0000-000000000002','financeiro',true),
 ('00000000-0000-0000-0000-000000000003','financeiro',true);
insert into public.staff_finance_action_permissions(profile_id,action_key,allowed) values
 ('00000000-0000-0000-0000-000000000002','titulos_criar',true),
 ('00000000-0000-0000-0000-000000000003','titulos_criar',true);
insert into public.receivables(id,original_amount,status) values
 ('10000000-0000-0000-0000-000000000001',100,'open');
