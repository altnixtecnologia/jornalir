-- Cobrança por compra, alocação por serviço, reestruturação administrativa e tolerância global/individual.
-- ADITIVA. NÃO aplicada. Não cria vendas, títulos, pagamentos nem decisões; não altera dados existentes.
-- Reaproveita: receivables / receivable_receipts / receivable_adjustments / payment_charges,
-- commercial_sales.items_snapshot, commercial_contract_services e o processador altnix_operational.*.
-- Dinheiro em centavos inteiros (bigint) nas alocações; nunca ponto flutuante.

-- ======================================================================================
-- 1) Alocação por serviço: quanto de cada título pertence a cada produto/serviço da compra.
--    Invariante (verificada no COMMIT): soma das alocações de um título == original_amount.
--    Serviço de valor zero nunca recebe alocação (sem dívida artificial). Imutável.
-- ======================================================================================
create table public.receivable_service_allocations (
  receivable_id uuid not null references public.receivables(id) on delete restrict,
  service_id uuid not null references public.commercial_contract_services(id) on delete restrict,
  allocated_cents bigint not null check (allocated_cents > 0),
  created_at timestamptz not null default now(),
  primary key (receivable_id, service_id)
);
create index receivable_service_allocations_service_idx on public.receivable_service_allocations (service_id);
alter table public.receivable_service_allocations enable row level security;
revoke all on public.receivable_service_allocations from public, anon, authenticated;
revoke update, delete, truncate on public.receivable_service_allocations from service_role;
grant select on public.receivable_service_allocations to authenticated;
grant select, insert on public.receivable_service_allocations to service_role;
create policy receivable_service_allocations_read on public.receivable_service_allocations
  for select to authenticated using (public.staff_can_see_module('financeiro'));
comment on table public.receivable_service_allocations is
  'Composição de cada título por serviço (centavos inteiros). Soma por título == original_amount. Imutável: reestruturar cria novos títulos e novas alocações; nunca reescreve. Pagamento parcial NÃO é rateado entre serviços.';

create function public.check_receivable_allocation_total()
returns trigger language plpgsql set search_path = '' as $fn$
declare v_original numeric; v_total bigint;
begin
  select original_amount into v_original from public.receivables where id = new.receivable_id;
  select coalesce(sum(allocated_cents), 0) into v_total
    from public.receivable_service_allocations where receivable_id = new.receivable_id;
  if v_original is null or v_total <> round(v_original * 100)::bigint then
    raise exception 'Alocação por serviço não confere com o valor do título.' using errcode = '23514';
  end if;
  return null;
end;
$fn$;
create constraint trigger receivable_service_allocations_total
  after insert on public.receivable_service_allocations
  deferrable initially deferred
  for each row execute function public.check_receivable_allocation_total();

-- ======================================================================================
-- 2) Reestruturação administrativa (unificar / dividir). Histórico nunca apagado.
-- ======================================================================================
create table public.receivable_restructurings (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  kind text not null check (kind in ('consolidate', 'split')),
  client_id uuid not null references public.clients(id) on delete restrict,
  total_cents bigint not null check (total_cents > 0),
  reason text not null check (length(btrim(reason)) between 10 and 500),
  actor uuid not null,
  created_at timestamptz not null default now()
);
create table public.receivable_restructuring_links (
  restructuring_id uuid not null references public.receivable_restructurings(id) on delete restrict,
  role text not null check (role in ('source', 'target')),
  receivable_id uuid not null references public.receivables(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  primary key (restructuring_id, role, receivable_id)
);
-- Um título só pode ser substituído uma vez.
create unique index receivable_restructuring_one_source on public.receivable_restructuring_links (receivable_id) where role = 'source';
create index receivable_restructuring_links_receivable_idx on public.receivable_restructuring_links (receivable_id);
alter table public.receivables add column if not exists restructuring_id uuid references public.receivable_restructurings(id) on delete restrict;
create index if not exists receivables_restructuring_idx on public.receivables (restructuring_id) where restructuring_id is not null;
alter table public.receivable_restructurings enable row level security;
alter table public.receivable_restructuring_links enable row level security;
revoke all on public.receivable_restructurings, public.receivable_restructuring_links from public, anon, authenticated;
revoke update, delete, truncate on public.receivable_restructurings, public.receivable_restructuring_links from service_role;
grant select on public.receivable_restructurings, public.receivable_restructuring_links to authenticated;
grant select, insert on public.receivable_restructurings, public.receivable_restructuring_links to service_role;
create policy receivable_restructurings_read on public.receivable_restructurings
  for select to authenticated using (public.staff_can_see_module('financeiro'));
create policy receivable_restructuring_links_read on public.receivable_restructuring_links
  for select to authenticated using (public.staff_can_see_module('financeiro'));
comment on table public.receivable_restructurings is
  'Operação administrativa de unificar/dividir cobranças em aberto: operador, motivo e relação entre títulos originais (cancelados, preservados) e substitutos. Imutável.';

-- ======================================================================================
-- 3) Tolerância: padrão global + substituição individual (0..30). Nenhuma presumida:
--    serviço sem substituição e sem herança explícita continua desativado.
-- ======================================================================================
create table altnix_operational.finance_policy (
  singleton boolean primary key default true check (singleton),
  default_grace_days integer check (default_grace_days between 0 and 30),
  approved_by uuid,
  approved_at timestamptz,
  check (default_grace_days is null or (approved_by is not null and approved_at is not null))
);
alter table altnix_operational.finance_policy enable row level security;
revoke all on altnix_operational.finance_policy from public, anon, authenticated, service_role;
grant select, insert, update on altnix_operational.finance_policy to service_role;
create policy finance_policy_server on altnix_operational.finance_policy for all to service_role using (true) with check (true);

alter table altnix_operational.service_binding add column if not exists financial_inherit_default boolean not null default false;
alter table altnix_operational.service_binding add constraint service_binding_inherit_approved
  check (not financial_inherit_default or (financial_approved_by is not null and financial_approved_at is not null));
grant update (financial_inherit_default) on altnix_operational.service_binding to service_role;

create function public.altnix_effective_grace(p_service uuid)
returns integer language sql stable security invoker set search_path = '' as $eff$
  select case
    when b.financial_grace_days is not null then b.financial_grace_days
    when b.financial_inherit_default then (select p.default_grace_days from altnix_operational.finance_policy p where p.singleton)
  end
  from altnix_operational.service_binding b where b.service_id = p_service and b.enabled;
$eff$;
revoke all on function public.altnix_effective_grace(uuid) from public, anon, authenticated;
grant execute on function public.altnix_effective_grace(uuid) to service_role;

create function public.altnix_configure_finance_default(p_actor uuid, p_days integer)
returns boolean language plpgsql security invoker set search_path = '' as $cfg$
begin
  if p_actor is null or (p_days is not null and p_days not between 0 and 30) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('altnix-finance-default', 0));
  insert into altnix_operational.finance_policy(singleton, default_grace_days, approved_by, approved_at)
  values (true, p_days, case when p_days is null then null else p_actor end, case when p_days is null then null else statement_timestamp() end)
  on conflict (singleton) do update set default_grace_days = excluded.default_grace_days,
    approved_by = excluded.approved_by, approved_at = excluded.approved_at;
  return true;
end;$cfg$;
revoke all on function public.altnix_configure_finance_default(uuid, integer) from public, anon, authenticated;
grant execute on function public.altnix_configure_finance_default(uuid, integer) to service_role;

-- ======================================================================================
-- 4) Alocação determinística de títulos de venda (centavos, maior resto, desempate por item).
--    Só aloca quando a composição é PROVADA: itens == serviços, soma dos itens == valor da venda.
--    Idempotente; nunca altera alocação existente.
-- ======================================================================================
create function public.altnix_allocate_sale_receivables(p_sale uuid)
returns integer language plpgsql security invoker set search_path = '' as $alloc$
declare
  sale record; svc record; rec record; v_items jsonb; v_len integer; v_sum bigint:=0; v_done integer:=0;
  v_w numeric; v_cents bigint;
begin
  if p_sale is null then return -1; end if;
  perform pg_advisory_xact_lock(hashtextextended('receivable-alloc:' || p_sale::text, 0));
  select v.id, v.amount, v.items_snapshot into sale from public.commercial_sales v where v.id = p_sale;
  if not found or sale.items_snapshot is null or jsonb_typeof(sale.items_snapshot) <> 'array' then return -1; end if;
  v_len := jsonb_array_length(sale.items_snapshot);
  if v_len = 0 or (select count(*) from public.commercial_contract_services s join public.commercial_contract_packages p on p.id = s.package_id
      where p.commercial_sale_id = p_sale) <> v_len then return -1; end if;
  -- Tabela temporária lógica (CTE por título): peso por serviço em centavos.
  for svc in
    select s.id, s.item_ordinal,
           case when (sale.items_snapshot -> s.item_ordinal ->> 'totalAmount') ~ '^[0-9]+(\.[0-9]+)?$'
                then round((sale.items_snapshot -> s.item_ordinal ->> 'totalAmount')::numeric * 100)::bigint else null end as cents
    from public.commercial_contract_services s join public.commercial_contract_packages p on p.id = s.package_id
    where p.commercial_sale_id = p_sale
  loop
    if svc.cents is null or svc.item_ordinal < 0 or svc.item_ordinal >= v_len then return -1; end if;
    v_sum := v_sum + svc.cents;
  end loop;
  if v_sum <> round(sale.amount * 100)::bigint then return -1; end if;
  if v_sum = 0 then return 0; end if;
  for rec in
    select r.id, round(r.original_amount * 100)::bigint as total
    from public.receivables r
    where r.commercial_sale_id = p_sale and r.status <> 'cancelled' and r.original_amount > 0
      and not exists (select 1 from public.receivable_service_allocations a where a.receivable_id = r.id)
    order by r.installment_number
  loop
    insert into public.receivable_service_allocations (receivable_id, service_id, allocated_cents)
    select rec.id, q.service_id, q.base + case when q.rn <= q.remaining then 1 else 0 end
    from (
      select c.service_id, c.base, c.frac, c.item_ordinal,
             row_number() over (order by c.frac desc, c.item_ordinal) as rn,
             rec.total - sum(c.base) over () as remaining
      from (
        select s.id as service_id, s.item_ordinal,
               floor(rec.total::numeric * w.cents / v_sum)::bigint as base,
               mod(rec.total::numeric * w.cents, v_sum::numeric) as frac
        from public.commercial_contract_services s
        join public.commercial_contract_packages p on p.id = s.package_id and p.commercial_sale_id = p_sale
        cross join lateral (select round((sale.items_snapshot -> s.item_ordinal ->> 'totalAmount')::numeric * 100)::bigint as cents) w
        where w.cents > 0
      ) c
    ) q
    where q.base + case when q.rn <= q.remaining then 1 else 0 end > 0;
    v_done := v_done + 1;
  end loop;
  return v_done;
end;$alloc$;
revoke all on function public.altnix_allocate_sale_receivables(uuid) from public, anon, authenticated;
grant execute on function public.altnix_allocate_sale_receivables(uuid) to service_role;

-- ======================================================================================
-- 5) Avaliação financeira POR SERVIÇO, com base nas alocações (substitui a regra de serviço único).
--    Não rateia pagamento parcial: um título com saldo em aberto mantém em aberto todos os serviços
--    nele alocados. Título de teste (report_excluded_at) não gera restrição. Mesmas razões/estados.
-- ======================================================================================
create or replace function public.altnix_assess_service_finance(p_service uuid, p_grace_days integer)
returns jsonb language plpgsql stable security invoker set search_path = '' as $finance$
declare
  x record;
  civil_day date := (statement_timestamp() at time zone 'America/Sao_Paulo')::date;
  item_cents bigint; live integer; allocated bigint; bad integer; oldest date; raw_total text;
begin
  if p_service is null or p_grace_days is null or p_grace_days not between 0 and 30 then return null; end if;
  select s.starts_on, s.ends_on, s.item_ordinal, v.id as sale_id, v.client_id, v.status, v.commercial_condition, v.amount, v.items_snapshot,
         exists(select 1 from public.client_digital_export_permissions e where e.client_id = v.client_id and e.enabled) as export_enabled
  into x
  from public.commercial_contract_services s join public.commercial_contract_packages p on p.id = s.package_id
  join public.commercial_sales v on v.id = p.commercial_sale_id and v.client_id = p.client_id
  where s.id = p_service and s.service_channel = 'led_panel';
  if not found then return null; end if;
  if x.status = 'cancelled' or (x.ends_on is not null and x.ends_on < civil_day) then
    return jsonb_build_object('state', 'ended', 'reason', 'service_ended');
  end if;
  if not x.export_enabled then return jsonb_build_object('state', 'suspended', 'reason', 'export_revoked'); end if;
  if x.status not in ('approved', 'active') or x.starts_on is null or x.starts_on > civil_day then
    return jsonb_build_object('state', 'review', 'reason', 'sale_or_period_not_ready');
  end if;
  if x.items_snapshot is null or jsonb_typeof(x.items_snapshot) <> 'array'
     or x.item_ordinal is null or x.item_ordinal < 0 or x.item_ordinal >= jsonb_array_length(x.items_snapshot)
     or x.items_snapshot -> x.item_ordinal ->> 'serviceChannel' is distinct from 'led_panel' then
    return jsonb_build_object('state', 'review', 'reason', 'allocation_not_proven');
  end if;
  if x.commercial_condition not in ('cash', 'installments') then
    return jsonb_build_object('state', 'review', 'reason', 'non_monetary_or_undefined');
  end if;
  if x.amount is null or x.amount <= 0 then
    return jsonb_build_object('state', 'review', 'reason', 'billing_incomplete');
  end if;
  raw_total := x.items_snapshot -> x.item_ordinal ->> 'totalAmount';
  if raw_total is null or raw_total !~ '^[0-9]+(\.[0-9]+)?$' then
    return jsonb_build_object('state', 'review', 'reason', 'allocation_not_proven');
  end if;
  item_cents := round(raw_total::numeric * 100)::bigint;
  -- Serviço sem valor não tem dívida artificial.
  if item_cents = 0 then return jsonb_build_object('state', 'authorized', 'reason', 'no_overdue_balance'); end if;
  select count(*), coalesce(sum(a.allocated_cents), 0),
         count(*) filter (where r.client_id is distinct from x.client_id or r.status is null or r.status not in ('open', 'partially_paid', 'paid')
              or r.due_date is null or r.balance is null or r.balance < 0
              or (r.status = 'paid' and r.balance <> 0) or (r.status <> 'paid' and r.balance = 0)),
         min(r.due_date) filter (where t.report_excluded_at is null and r.balance > 0 and r.due_date < civil_day)
  into live, allocated, bad, oldest
  from public.receivable_service_allocations a
  join public.receivables_with_balance r on r.id = a.receivable_id
  join public.receivables t on t.id = r.id
  where a.service_id = p_service and r.status <> 'cancelled';
  if live = 0 then return jsonb_build_object('state', 'review', 'reason', 'allocation_not_proven'); end if;
  if allocated <> item_cents or bad <> 0 then return jsonb_build_object('state', 'review', 'reason', 'billing_incomplete'); end if;
  if oldest is null then return jsonb_build_object('state', 'authorized', 'reason', 'no_overdue_balance'); end if;
  if civil_day <= oldest + p_grace_days then return jsonb_build_object('state', 'grace', 'reason', 'overdue_within_grace', 'oldestDue', oldest); end if;
  return jsonb_build_object('state', 'suspended', 'reason', 'overdue_after_grace', 'oldestDue', oldest);
end;$finance$;

-- ======================================================================================
-- 6) Configuração de tolerância por serviço: desligado / substituição (0..30) / herdar padrão.
-- ======================================================================================
create function public.altnix_configure_service_finance_mode(p_service uuid, p_actor uuid, p_mode text, p_days integer)
returns boolean language plpgsql security invoker set search_path = '' as $mode$
declare n integer; evidence jsonb; v_effective integer; v_sale uuid;
begin
  if p_service is null or p_actor is null or p_mode is null or p_mode not in ('off', 'override', 'inherit') then return false; end if;
  if p_mode = 'override' and (p_days is null or p_days not between 0 and 30) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('altnix-service:' || p_service::text, 0));
  if p_mode <> 'off' then
    v_effective := case when p_mode = 'override' then p_days
      else (select d.default_grace_days from altnix_operational.finance_policy d where d.singleton) end;
    if v_effective is null then return false; end if;
    select p.commercial_sale_id into v_sale from altnix_operational.service_binding b
      join public.commercial_contract_packages p on p.id = b.package_id where b.service_id = p_service and b.enabled;
    if v_sale is null then return false; end if;
    perform public.altnix_allocate_sale_receivables(v_sale);
    evidence := public.altnix_assess_service_finance(p_service, v_effective);
    if evidence is null or evidence ->> 'reason' not in ('no_overdue_balance', 'overdue_within_grace', 'overdue_after_grace') then return false; end if;
    if not exists (select 1 from altnix_operational.service_outbox o where o.service_id = p_service
      and o.revision = (select max(t.revision) from altnix_operational.service_outbox t where t.service_id = p_service)
      and (o.payload ->> 'status' in ('authorized', 'grace') or (o.decision_origin = 'finance' and o.payload ->> 'status' = 'suspended'))) then return false; end if;
  end if;
  update altnix_operational.service_binding set
    financial_grace_days = case p_mode when 'override' then p_days else null end,
    financial_inherit_default = (p_mode = 'inherit'),
    financial_approved_by = case when p_mode = 'off' then null else p_actor end,
    financial_approved_at = case when p_mode = 'off' then null else statement_timestamp() end
  where service_id = p_service and enabled;
  get diagnostics n = row_count;
  return n = 1;
end;$mode$;
revoke all on function public.altnix_configure_service_finance_mode(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.altnix_configure_service_finance_mode(uuid, uuid, text, integer) to service_role;

create function public.altnix_read_service_finance_policy(p_service uuid)
returns jsonb language sql stable security invoker set search_path = '' as $read$
  select jsonb_build_object(
    'mode', case when b.financial_grace_days is not null then 'override' when b.financial_inherit_default then 'inherit' else 'off' end,
    'overrideDays', b.financial_grace_days,
    'defaultDays', (select d.default_grace_days from altnix_operational.finance_policy d where d.singleton),
    'effectiveDays', public.altnix_effective_grace(b.service_id))
  from altnix_operational.service_binding b where b.service_id = p_service and b.enabled;
$read$;
revoke all on function public.altnix_read_service_finance_policy(uuid) from public, anon, authenticated;
grant execute on function public.altnix_read_service_finance_policy(uuid) to service_role;

-- ======================================================================================
-- 7) Processador existente passa a usar a tolerância efetiva e as alocações.
--    Mesma fila/outbox/entrega; nada de segundo mecanismo. Suspensão manual nunca é desfeita por pagamento.
-- ======================================================================================
create or replace function public.altnix_apply_service_finance(p_service uuid)
returns text language plpgsql security invoker set search_path = '' as $apply$
declare b altnix_operational.service_binding%rowtype; last_event altnix_operational.service_outbox%rowtype;
        evidence jsonb; desired text; result jsonb; grace integer; v_sale uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('altnix-service:' || p_service::text, 0));
  select * into b from altnix_operational.service_binding where service_id = p_service and enabled;
  if not found then return 'disabled'; end if;
  grace := public.altnix_effective_grace(p_service);
  if grace is null or b.financial_approved_by is null then return 'disabled'; end if;
  select p.commercial_sale_id into v_sale from public.commercial_contract_packages p where p.id = b.package_id;
  perform public.altnix_allocate_sale_receivables(v_sale);
  select * into last_event from altnix_operational.service_outbox where service_id = p_service order by revision desc limit 1;
  if not found or last_event.payload ->> 'status' = 'ended' then return 'manual_required'; end if;
  evidence := public.altnix_assess_service_finance(p_service, grace);
  if evidence is null or evidence ->> 'state' = 'review' then return 'review'; end if;
  desired := evidence ->> 'state';
  if last_event.payload ->> 'status' = 'suspended' and last_event.decision_origin = 'manual' and desired <> 'ended' then return 'manual_required'; end if;
  if desired = last_event.payload ->> 'status' then return 'unchanged'; end if;
  result := public.altnix_queue_service_authorization(p_service, gen_random_uuid(), b.financial_approved_by, desired, null, 'finance_rule:' || (evidence ->> 'reason'), 'finance');
  if result is null then return 'review'; end if;
  return 'queued';
end;$apply$;

create or replace function public.altnix_reassess_service_finance_batch(p_sale uuid, p_after uuid, p_limit integer default 25)
returns table(service_id uuid, outcome text)
language plpgsql security invoker set search_path = '' as $batch$
declare candidate uuid;
begin
  if p_limit is null or p_limit not between 1 and 50 then return; end if;
  for candidate in
    select b.service_id from altnix_operational.service_binding b
    join public.commercial_contract_packages p on p.id = b.package_id and p.client_id = b.client_id
    where b.enabled and public.altnix_effective_grace(b.service_id) is not null
      and (p_sale is null or p.commercial_sale_id = p_sale)
      and (p_after is null or b.service_id > p_after)
    order by b.service_id limit p_limit
  loop
    service_id := candidate;
    outcome := public.altnix_apply_service_finance(candidate);
    return next;
  end loop;
end;$batch$;

-- Evento financeiro confirmado (baixa/estorno/reestruturação): reavalia SOMENTE os serviços ligados
-- aos títulos informados — por alocação (cobre títulos substitutos, sem commercial_sale_id) ou pela venda.
create or replace function public.altnix_reassess_receivable_services(p_receivable_ids uuid[])
returns integer language plpgsql security invoker set search_path = '' as $receivable_event$
declare candidate uuid; processed integer := 0;
begin
  if p_receivable_ids is null or cardinality(p_receivable_ids) not between 1 and 50
     or array_position(p_receivable_ids, null::uuid) is not null then return 0; end if;
  for candidate in
    select x.service_id from (
      select b.service_id from altnix_operational.service_binding b
      join public.receivable_service_allocations a on a.service_id = b.service_id
      where b.enabled and a.receivable_id = any(p_receivable_ids)
      union
      select b.service_id from altnix_operational.service_binding b
      join public.commercial_contract_packages p on p.id = b.package_id and p.client_id = b.client_id
      join public.receivables_with_balance r on r.commercial_sale_id = p.commercial_sale_id and r.client_id = b.client_id
      where b.enabled and r.id = any(p_receivable_ids)
    ) x
    where public.altnix_effective_grace(x.service_id) is not null
    order by x.service_id limit 50
  loop
    perform public.altnix_apply_service_finance(candidate);
    processed := processed + 1;
  end loop;
  return processed;
end;$receivable_event$;

-- ======================================================================================
-- 8) Reestruturação atômica (unificar/dividir). Chamada só pelo servidor autorizado (service_role);
--    o operador, a permissão e o cancelamento SEGURO das cobranças externas são provados antes, no servidor.
--    Aqui: revalida tudo sob lock, conserva centavos por serviço e preserva a linhagem.
--    Só títulos 100% em aberto e sem histórico (recebimento/abatimento) são reestruturados: um pagamento
--    parcial nunca é rateado entre serviços (decisão de negócio/contábil explícita fica fora do automático).
-- ======================================================================================
create function public.restructure_receivables(
  p_operation uuid, p_kind text, p_sources uuid[], p_targets jsonb, p_reason text, p_actor uuid
) returns jsonb language plpgsql security definer set search_path = '' as $restructure$
declare
  v_today date := (statement_timestamp() at time zone 'America/Sao_Paulo')::date;
  v_existing public.receivable_restructurings%rowtype;
  v_client uuid; v_src record; v_t jsonb; v_a jsonb; v_id uuid; v_new uuid;
  v_total bigint := 0; v_cents bigint; v_target_ids uuid[] := '{}'; v_due date; v_desc text; v_n integer;
  v_sale uuid;
begin
  if p_operation is null or p_actor is null or p_kind not in ('consolidate', 'split')
     or p_sources is null or cardinality(p_sources) not between 1 and 50 or array_position(p_sources, null::uuid) is not null
     or (select count(distinct s) from unnest(p_sources) s) <> cardinality(p_sources)
     or (p_kind = 'consolidate' and cardinality(p_sources) < 2)
     or p_targets is null or jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) not between 1 and 60
     or p_reason is null or length(btrim(p_reason)) not between 10 and 500 then
    raise exception 'Parâmetros inválidos para reestruturar cobranças.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('receivable-restructure:' || p_operation::text, 0));
  select * into v_existing from public.receivable_restructurings where operation_id = p_operation;
  if found then
    -- Repetição exata da mesma operação: devolve o resultado, sem duplicar.
    if v_existing.kind <> p_kind or v_existing.actor <> p_actor
       or (select array_agg(l.receivable_id order by l.receivable_id) from public.receivable_restructuring_links l
           where l.restructuring_id = v_existing.id and l.role = 'source') is distinct from (select array_agg(s order by s) from unnest(p_sources) s) then
      raise exception 'Identificador de operação já usado com outros dados.' using errcode = '23505';
    end if;
    return jsonb_build_object('restructuringId', v_existing.id, 'replayed', true,
      'targetIds', (select coalesce(jsonb_agg(l.receivable_id order by l.receivable_id), '[]'::jsonb) from public.receivable_restructuring_links l where l.restructuring_id = v_existing.id and l.role = 'target'));
  end if;
  -- Serializa por título (ordem estável) para evitar impasse entre operações concorrentes.
  perform 1 from public.receivables r where r.id = any(p_sources) order by r.id for update;
  select count(*) into v_n from public.receivables r where r.id = any(p_sources);
  if v_n <> cardinality(p_sources) then raise exception 'Título de origem não encontrado.' using errcode = '22023'; end if;
  select min(r.client_id::text)::uuid into v_client from public.receivables r where r.id = any(p_sources);
  if exists (select 1 from public.receivables r where r.id = any(p_sources) and r.client_id <> v_client) then
    raise exception 'Cobranças de clientes diferentes não podem ser reestruturadas juntas.' using errcode = '42501';
  end if;
  -- Compras de origem: garante a alocação por serviço (idempotente) antes de validar.
  for v_sale in select distinct r.commercial_sale_id from public.receivables r where r.id = any(p_sources) and r.commercial_sale_id is not null loop
    perform public.altnix_allocate_sale_receivables(v_sale);
  end loop;
  for v_src in select r.* from public.receivables r where r.id = any(p_sources) order by r.id loop
    if v_src.source_type <> 'advertising' or v_src.status <> 'open' or v_src.original_amount <= 0 or v_src.report_excluded_at is not null then
      raise exception 'Título % não é elegível (somente publicidade em aberto, não classificado como teste).', v_src.internal_reference using errcode = '22023';
    end if;
    if exists (select 1 from public.receivable_receipts x where x.receivable_id = v_src.id)
       or exists (select 1 from public.receivable_adjustments x where x.receivable_id = v_src.id) then
      raise exception 'Título % possui recebimento ou abatimento: concilie o histórico antes de reestruturar.', v_src.internal_reference using errcode = '22023';
    end if;
    if exists (select 1 from public.payment_charges c where c.receivable_id = v_src.id and c.status in ('pending', 'paid')) then
      raise exception 'Título % possui cobrança externa ativa ou paga: resolva antes de reestruturar.', v_src.internal_reference using errcode = '22023';
    end if;
    if exists (select 1 from public.receivable_restructuring_links l where l.receivable_id = v_src.id and l.role = 'source') then
      raise exception 'Título % já foi substituído por outra reestruturação.', v_src.internal_reference using errcode = '22023';
    end if;
    if (select coalesce(sum(a.allocated_cents), 0) from public.receivable_service_allocations a where a.receivable_id = v_src.id) <> round(v_src.original_amount * 100)::bigint then
      raise exception 'Composição por serviço do título % não comprovada.', v_src.internal_reference using errcode = '22023';
    end if;
    v_total := v_total + round(v_src.original_amount * 100)::bigint;
  end loop;
  -- Conservação por serviço: soma das origens == soma dos destinos; nada negativo, nada órfão.
  if exists (
    with src as (select a.service_id, sum(a.allocated_cents) c from public.receivable_service_allocations a where a.receivable_id = any(p_sources) group by a.service_id),
    tgt as (select (x ->> 'serviceId')::uuid as service_id, sum((x ->> 'cents')::bigint) c
            from jsonb_array_elements(p_targets) t, jsonb_array_elements(t -> 'allocations') x group by 1)
    select 1 from src full join tgt on tgt.service_id = src.service_id where coalesce(src.c, -1) <> coalesce(tgt.c, -2)
  ) then raise exception 'A divisão não conserva o valor por serviço.' using errcode = '22023'; end if;
  insert into public.receivable_restructurings(operation_id, kind, client_id, total_cents, reason, actor)
  values (p_operation, p_kind, v_client, v_total, btrim(p_reason), p_actor) returning id into v_id;
  for v_t in select * from jsonb_array_elements(p_targets) loop
    v_due := (v_t ->> 'dueDate')::date;
    v_desc := nullif(btrim(coalesce(v_t ->> 'description', '')), '');
    if v_due is null or v_due < v_today or v_desc is null or length(v_desc) > 300
       or jsonb_typeof(v_t -> 'allocations') <> 'array' or jsonb_array_length(v_t -> 'allocations') < 1 then
      raise exception 'Destino inválido (vencimento no passado, descrição ou composição ausente).' using errcode = '22023';
    end if;
    v_cents := 0;
    for v_a in select * from jsonb_array_elements(v_t -> 'allocations') loop
      if (v_a ->> 'cents') !~ '^[1-9][0-9]{0,14}$' then raise exception 'Valor alocado inválido.' using errcode = '22023'; end if;
      v_cents := v_cents + (v_a ->> 'cents')::bigint;
    end loop;
    if (select count(distinct x ->> 'serviceId') from jsonb_array_elements(v_t -> 'allocations') x) <> jsonb_array_length(v_t -> 'allocations') then
      raise exception 'Serviço repetido na composição de um destino.' using errcode = '22023';
    end if;
    insert into public.receivables(client_id, description, source_type, source_reference, original_amount, issue_date, due_date, restructuring_id, status)
    values (v_client, v_desc, 'advertising', 'Reestruturação ' || to_char(v_today, 'YYYY-MM-DD'), v_cents::numeric / 100, v_today, v_due, v_id, 'open')
    returning id into v_new;
    insert into public.receivable_service_allocations(receivable_id, service_id, allocated_cents)
    select v_new, (x ->> 'serviceId')::uuid, (x ->> 'cents')::bigint from jsonb_array_elements(v_t -> 'allocations') x;
    insert into public.receivable_restructuring_links(restructuring_id, role, receivable_id, amount_cents) values (v_id, 'target', v_new, v_cents);
    v_target_ids := v_target_ids || v_new;
  end loop;
  if (select coalesce(sum(l.amount_cents), 0) from public.receivable_restructuring_links l where l.restructuring_id = v_id and l.role = 'target') <> v_total then
    raise exception 'Total dos destinos não confere com o total em aberto.' using errcode = '22023';
  end if;
  for v_src in select r.* from public.receivables r where r.id = any(p_sources) order by r.id loop
    insert into public.receivable_restructuring_links(restructuring_id, role, receivable_id, amount_cents)
    values (v_id, 'source', v_src.id, round(v_src.original_amount * 100)::bigint);
    update public.receivables set status = 'cancelled',
      notes = left(coalesce(notes || E'\n', '') || 'Substituído por reestruturação em ' || to_char(v_today, 'YYYY-MM-DD') || '.', 2000)
    where id = v_src.id;
  end loop;
  return jsonb_build_object('restructuringId', v_id, 'replayed', false, 'targetIds', to_jsonb(v_target_ids));
end;$restructure$;
revoke all on function public.restructure_receivables(uuid, text, uuid[], jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.restructure_receivables(uuid, text, uuid[], jsonb, text, uuid) to service_role;
