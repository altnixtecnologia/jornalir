-- Executado apenas em PostgreSQL 16 DESCARTAVEL no CI.
-- Testa que a migration fiscal e valida e preserva o bloqueio de UPDATE.
begin;

create table public.nfse_issuer_configs (id bigint primary key, notes text);
create table public.nfse_drafts (
  id bigint primary key,
  notes text,
  status text not null default 'draft',
  transmission_locked_at timestamptz
);

-- Simula somente a API do guard JA instalado no Supabase oficial.
-- Não substitui sua implementação fiscal em produção.
create function public.guard_nfse_draft_fiscal_edit()
returns trigger language plpgsql as $$
begin
  if old.status is distinct from 'draft' or old.transmission_locked_at is not null then
    raise exception 'Nao editar DPS pendente/autorizada' using errcode = '55000';
  end if;
  return new;
end;
$$;

\i supabase/migrations/20261122341000_nfse_fiscal_observations.sql

insert into public.nfse_issuer_configs (id, notes, default_fiscal_observation)
values (1, 'Anotacao interna', 'Texto fiscal padrão para novas notas');

insert into public.nfse_drafts (id, notes, fiscal_observation, purchase_order_number)
values (1, 'Interno: não enviar', 'Texto fiscal original da nota', 'OC-001');

update public.nfse_drafts
set fiscal_observation = '', purchase_order_number = ''
where id = 1;

do $$
declare v_fiscal text; v_order text; v_notes text;
begin
  select fiscal_observation, purchase_order_number, notes
    into v_fiscal, v_order, v_notes
    from public.nfse_drafts where id = 1;
  if v_fiscal <> '' or v_order <> '' or v_notes <> 'Interno: não enviar' then
    raise exception 'Campos de nota não foram limpos, ou notes internos foram alterados';
  end if;

  begin
    update public.nfse_drafts set fiscal_observation = repeat('a', 2001) where id=1;
    raise exception 'Aceitou informação complementar acima do limite';
  exception when check_violation then null;
  end;

  begin
    update public.nfse_drafts set purchase_order_number = repeat('b', 61) where id=1;
    raise exception 'Aceitou ordem de compra acima do limite';
  exception when check_violation then null;
  end;

  begin
    update public.nfse_issuer_configs set default_fiscal_observation = repeat('x',2001) where id=1;
    raise exception 'Aceitou texto padrão acima do limite';
  exception when check_violation then null;
  end;

  -- Confirma que o trigger adicional impede contornar a trava via SQL.
  update public.nfse_drafts set status='authorized' where id=1;
  begin
    update public.nfse_drafts set fiscal_observation='TEXTO ALTERADO' where id=1;
    raise exception 'Permitiu editar observações de nota autorizada';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.nfse_drafts set purchase_order_number='OC-999' where id=1;
    raise exception 'Permitiu editar pedido de nota autorizada';
  exception when sqlstate '55000' then null;
  end;

  if not exists (select 1 from pg_trigger where tgname='nfse_draft_additional_info_guard' and not tgisinternal) then
    raise exception 'Migration não criou trigger fiscal';
  end if;
end;
$$;

rollback;
