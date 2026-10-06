-- Módulo Assinaturas (estrutura inicial) — vincula um serviço (impresso/
-- digital/TV) a um Cliente já cadastrado (public.clients, migration
-- 20261011100000_clients.sql — esta migration depende dela existir
-- primeiro). Um mesmo client_id pode ter mais de uma linha aqui (ex.:
-- impresso + TV simultâneos). Cobrança/contas a receber/baixa de
-- pagamento são módulos futuros (Financeiro) que vão referenciar
-- subscription_id em tabelas próprias — nenhum campo financeiro de
-- verdade entra aqui ainda, só o vínculo e os dados básicos do serviço.
--
-- IMPORTANTE: esta migration está versionada mas NÃO foi aplicada ao
-- banco. Depende de public.clients (ainda pendente) já existir. Não
-- aplicar com supabase db push --include-all nem manipular
-- supabase_migrations.schema_migrations manualmente para contornar a
-- ordem — aplicar normalmente, na sequência, quando o Supabase voltar e
-- a migration de Clientes também for aplicada.

create sequence public.subscriptions_reference_seq;

create or replace function public.generate_subscription_reference()
returns text
language sql
as $$
  select 'IR-ASS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.subscriptions_reference_seq')::text, 6, '0');
$$;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  internal_reference text not null unique default public.generate_subscription_reference(),

  client_id uuid not null references public.clients (id),

  service_type text not null check (service_type in ('impresso', 'digital', 'tv')),
  status text not null default 'active' check (status in ('active', 'suspended', 'cancelled')),

  -- Valor em reais (não centavos) — estrutura inicial, sem regra de
  -- cobrança/reajuste ainda; Financeiro decide a representação definitiva
  -- quando contas a receber for implementado.
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  periodicity text not null default 'monthly' check (periodicity in ('monthly', 'quarterly', 'semiannual', 'annual')),

  starts_at date not null default current_date,
  -- Vencimento simples (uma data), sem motor de recorrência/cobrança
  -- automática nesta fase — isso é explicitamente um módulo futuro.
  due_date date,

  notes text,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subscriptions_due_date_not_before_start check (due_date is null or due_date >= starts_at)
);

comment on table public.subscriptions is
  'Estrutura inicial do módulo Assinaturas — vínculo de um serviço (impresso/digital/tv) a um cliente. Um client_id pode ter várias linhas (mais de um serviço simultâneo). Cobrança/contas a receber/baixa de pagamento são módulos futuros (Financeiro) que referenciam subscription_id, nunca ganham coluna aqui.';
comment on column public.subscriptions.amount is
  'Valor em reais (numeric, não centavos) — revisar representação quando Financeiro definir o motor de cobrança.';
comment on column public.subscriptions.due_date is
  'Vencimento simples (uma data), sem recorrência automática — cobrança/lembretes são módulos futuros.';

create index subscriptions_client_id_idx on public.subscriptions (client_id);
create index subscriptions_status_idx on public.subscriptions (status);
create index subscriptions_service_type_idx on public.subscriptions (service_type);
create index subscriptions_due_date_idx on public.subscriptions (due_date) where due_date is not null;
create index subscriptions_created_at_idx on public.subscriptions (created_at desc);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row
  execute function public.set_updated_at();

create or replace function public.set_subscription_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

comment on function public.set_subscription_actor() is
  'created_by sempre auth.uid() da sessão autenticada — ignora qualquer valor vindo do cliente, mesmo princípio de set_client_actor()/set_media_asset_actor().';

create trigger subscriptions_set_actor
  before insert on public.subscriptions
  for each row
  execute function public.set_subscription_actor();

alter table public.subscriptions enable row level security;

create policy subscriptions_select_staff
  on public.subscriptions for select
  to authenticated
  using (public.is_active_staff());

create policy subscriptions_insert_staff
  on public.subscriptions for insert
  to authenticated
  with check (public.is_active_staff());

create policy subscriptions_update_staff
  on public.subscriptions for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete — mesmo princípio de public.clients: cancelar via
-- status ('cancelled') é a única remoção oferecida, nunca apagar a linha.
