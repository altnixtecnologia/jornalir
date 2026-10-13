alter table public.clients
  add column if not exists asaas_customer_environment text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.clients'::regclass
      and conname='clients_asaas_customer_environment_check'
  ) then
    alter table public.clients
      add constraint clients_asaas_customer_environment_check
      check (
        asaas_customer_environment is null
        or asaas_customer_environment in ('sandbox','production')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.clients'::regclass
      and conname='clients_asaas_customer_pair_check'
  ) then
    alter table public.clients
      add constraint clients_asaas_customer_pair_check
      check (
        (asaas_customer_id is null and asaas_customer_environment is null)
        or
        (asaas_customer_id is not null and asaas_customer_environment is not null)
      ) not valid;
  end if;
end $$;

comment on column public.clients.asaas_customer_environment is
  'Ambiente em que asaas_customer_id foi obtido. Nunca reutilizar um customer_id de sandbox em production nem o inverso.';
