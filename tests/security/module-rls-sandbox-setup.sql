-- Dados 100% fictícios para validar as permissões fora do Supabase.
do $roles$ begin create role service_role nologin; exception when duplicate_object then null; end $roles$;
-- Executar após finance-rls-sandbox-setup.sql.
create or replace function auth.role() returns text language sql stable as $$
  select current_setting('request.jwt.claim.role',true)
$$;

create table public.clients(
 id uuid primary key, status text default 'active', kind text,
 full_name text, created_at timestamptz default now()
);
create table public.client_roles(
 id uuid primary key, client_id uuid not null, role text not null
);
create table public.subscriptions(
 id uuid primary key, client_id uuid, service_type text, status text not null default 'active',
 amount numeric not null default 0, periodicity text default 'monthly',
 starts_at date default current_date, updated_at timestamptz default now(),
 cancelled_at timestamptz, cancellation_reason text
);
create table public.commercial_products(
 id uuid primary key, name text not null, channel text not null default 'newspaper',
 suggested_price numeric, active boolean default true
);
create table public.commercial_proposals(
 id uuid primary key, client_id uuid, status text not null default 'draft',
 converted_sale_id uuid, notes text, proposal_date date default current_date,
 updated_by uuid, updated_at timestamptz default now()
);
create table public.commercial_proposal_items(
 id uuid primary key, proposal_id uuid not null, description text, quantity numeric,
 unit_price numeric, discount_amount numeric, sort_order integer
);
create table public.commercial_sales(
 id uuid primary key, client_id uuid, proposal_id uuid,
 status text not null default 'proposal', amount numeric,
 updated_by uuid,updated_at timestamptz default now()
);

-- Reproduz políticas amplas atuais, a substituir pela migração.
do $setup$
declare v_table text;
begin
 foreach v_table in array array[
  'clients','client_roles','subscriptions','commercial_products',
  'commercial_proposals','commercial_proposal_items','commercial_sales'
 ] loop
  execute format('alter table public.%I enable row level security',v_table);
  execute format('create policy %I on public.%I for select to authenticated using (public.is_active_staff())',v_table||'_select_staff',v_table);
  execute format('create policy %I on public.%I for insert to authenticated with check (public.is_active_staff())',v_table||'_insert_staff',v_table);
  execute format('create policy %I on public.%I for update to authenticated using (public.is_active_staff()) with check (public.is_active_staff())',v_table||'_update_staff',v_table);
 end loop;
end;
$setup$;
create policy client_roles_delete_staff on public.client_roles for delete to authenticated using (public.is_active_staff());
create policy commercial_proposal_items_delete_staff on public.commercial_proposal_items for delete to authenticated using (public.is_active_staff());
grant select,insert,update,delete on all tables in schema public to authenticated;

-- A conta do operador pode ver os três módulos, porém cada operação
-- depende de uma concessão individual. O terceiro perfil tem convite pendente.
-- Operador distinto, com SOMENTE assinatura: não herdará Clientes.
insert into auth.users(id,email_confirmed_at) values
 ('00000000-0000-0000-0000-000000000004',now());
insert into public.profiles(id,role,active) values
 ('00000000-0000-0000-0000-000000000004','operator',true);
insert into public.staff_module_visibility(profile_id,module_key,enabled) values
 ('00000000-0000-0000-0000-000000000004','assinaturas',true);
insert into public.staff_module_action_permissions(profile_id,module_key,action_key,allowed)
values('00000000-0000-0000-0000-000000000004','assinaturas','assinaturas_criar',true);

insert into public.staff_module_visibility(profile_id,module_key,enabled) values
 ('00000000-0000-0000-0000-000000000002','clientes',true),
 ('00000000-0000-0000-0000-000000000002','assinaturas',true),
 ('00000000-0000-0000-0000-000000000002','publicidade',true),
 ('00000000-0000-0000-0000-000000000003','clientes',true),
 ('00000000-0000-0000-0000-000000000003','assinaturas',true),
 ('00000000-0000-0000-0000-000000000003','publicidade',true);
insert into public.staff_module_action_permissions(profile_id,module_key,action_key,allowed) values
 ('00000000-0000-0000-0000-000000000002','clientes','clientes_criar',true),
 ('00000000-0000-0000-0000-000000000002','assinaturas','assinaturas_criar',true),
 ('00000000-0000-0000-0000-000000000002','publicidade','propostas_criar',true),
 ('00000000-0000-0000-0000-000000000003','clientes','clientes_editar',true);

insert into public.clients(id,kind,full_name) values
 ('40000000-0000-0000-0000-000000000001','person','Cliente de teste');
insert into public.commercial_proposals(id,client_id,status) values
 ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','draft');
