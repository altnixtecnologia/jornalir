-- GUARDA adicionada em 17/10/2026 (reconciliação de histórico): public.
-- clients só existe a partir de 20261014110000_clients.sql, 1 dia depois
-- deste arquivo, e a constraint de par abaixo também depende de
-- asaas_customer_id (só existe a partir de
-- 20261012223715_assine_requests_and_billing_provider.sql, já aplicado,
-- mas igualmente protegido por guarda — ver nota lá). Alteração real para
-- fresh install em 20261014214600_clients_asaas_customer_environment.sql
-- (nova, depois de clients_asaas_customer_id.sql).
do $$
begin
  if to_regclass('public.clients') is not null then
    alter table public.clients
      add column if not exists asaas_customer_environment text;

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

    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='clients' and column_name='asaas_customer_id'
    ) and not exists (
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

    comment on column public.clients.asaas_customer_environment is
      'Ambiente em que asaas_customer_id foi obtido. Nunca reutilizar um customer_id de sandbox em production nem o inverso.';
  end if;
end $$;
