-- Inventário e reservas de locação integradas ao Comercial.
-- Sem emissão automática de contratos, cobrança, assinaturas ou movimentação
-- física. Estas exigem conferência e revisão do modelo jurídico.
create extension if not exists btree_gist with schema extensions;

create table public.rental_assets (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.commercial_products(id) on delete restrict,
 asset_code text not null unique,
 brand text not null,
 model text not null,
 serial_number text unique,
 description text,
 accessory_inventory text,
 condition_notes text,
 status text not null default 'available'
   check (status in ('available','maintenance','retired')),
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint rental_asset_code_nonblank check(length(btrim(asset_code)) between 2 and 60),
 constraint rental_asset_brand_nonblank check(length(btrim(brand)) between 1 and 120),
 constraint rental_asset_model_nonblank check(length(btrim(model)) between 1 and 120),
 constraint rental_asset_serial_nonblank check(serial_number is null or length(btrim(serial_number)) > 0)
);

create table public.rental_bookings (
 id uuid primary key default gen_random_uuid(),
 commercial_sale_id uuid not null references public.commercial_sales(id) on delete restrict,
 asset_id uuid not null references public.rental_assets(id) on delete restrict,
 start_at timestamptz not null,
 end_at timestamptz not null,
 return_due_at timestamptz,
 collection_location text not null,
 return_location text not null,
 contact_person text not null,
 daily_rate numeric(12,2) not null check(daily_rate>=0),
 agreed_total numeric(12,2) not null check(agreed_total>=0),
 deposit_amount numeric(12,2) not null default 0 check(deposit_amount>=0),
 notes text,
 status text not null default 'draft'
   check(status in ('draft','reserved','checked_out','returned','cancelled')),
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint rental_dates_order check(end_at>start_at),
 constraint rental_booking_locations check(
   length(btrim(collection_location))>0
   and length(btrim(return_location))>0
   and length(btrim(contact_person))>0
 ),
 constraint rental_booking_return_order check(return_due_at is null or return_due_at>=start_at),
 -- Duas reservas ativas do mesmo aparelho não podem disputar o mesmo horário.
 constraint rental_bookings_no_overlap exclude using gist (
    asset_id with =,
    tstzrange(start_at,end_at,'[)') with &&
 ) where (status in ('reserved','checked_out'))
);
create index rental_bookings_by_sale_idx on public.rental_bookings(commercial_sale_id);
create index rental_bookings_by_asset_idx on public.rental_bookings(asset_id,start_at);

-- Fotografias permanecem apenas como caminhos de Storage privado. Nada
-- público é gravado no banco por padrão; o upload dependerá de policy.
create table public.rental_inspection_events (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.rental_bookings(id) on delete restrict,
 event_kind text not null check(event_kind in ('checkout','return')),
 inspected_at timestamptz not null default now(),
 condition_notes text not null,
 accessories_checklist jsonb not null default '[]'::jsonb
   check(jsonb_typeof(accessories_checklist)='array'),
 private_photo_paths jsonb not null default '[]'::jsonb
   check(jsonb_typeof(private_photo_paths)='array'),
 acknowledged_by text not null,
 recorded_by uuid references public.profiles(id) on delete set null,
 recorded_at timestamptz not null default now(),
 unique(booking_id,event_kind),
 constraint inspection_notes_nonblank check(length(btrim(condition_notes))>0),
 constraint inspection_ack_nonblank check(length(btrim(acknowledged_by))>0)
);

create or replace function public.enforce_rental_asset_product()
returns trigger language plpgsql set search_path=''
as $$
declare v_channel text;
begin
 select channel into v_channel from public.commercial_products where id=new.product_id;
 if v_channel is distinct from 'equipment_rental' then
  raise exception 'O aparelho deve estar vinculado a produto do canal locação.'
    using errcode='23514';
 end if;
 if TG_OP='UPDATE' and old.product_id is distinct from new.product_id
   and exists (select 1 from public.rental_bookings where asset_id=old.id) then
  raise exception 'Produto de equipamento com histórico de locação é imutável.'
    using errcode='23514';
 end if;
 if TG_OP='UPDATE' and new.status='retired' and old.status<>'retired'
   and exists(select 1 from public.rental_bookings
              where asset_id=old.id and status in ('reserved','checked_out')) then
  raise exception 'Não é possível desativar equipamento reservado ou emprestado.'
    using errcode='23514';
 end if;
 return new;
end;
$$;
create trigger rental_assets_validate_product before insert or update on public.rental_assets
 for each row execute function public.enforce_rental_asset_product();

create or replace function public.enforce_rental_booking()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_sale record; v_asset record; v_channel text;
begin
 select id,status,product_id,items_snapshot into v_sale
 from public.commercial_sales where id=new.commercial_sale_id;
 if v_sale.id is null or v_sale.status not in ('approved','active') then
   raise exception 'Reserva exige venda aprovada e não cancelada.'
     using errcode='23514';
 end if;
 select id,status,product_id into v_asset
 from public.rental_assets where id=new.asset_id;
 if v_asset.id is null then
   raise exception 'Equipamento não encontrado.' using errcode='23514';
 end if;
 if new.status in ('reserved','checked_out') and v_asset.status<>'available' then
   raise exception 'Equipamento indisponível para nova reserva.' using errcode='23514';
 end if;
 -- Não exigir que todo pacote seja aluguel; basta ao menos um item
 -- equipment_rental ou venda avulsa com produto de locação.
 if not (
   (v_sale.items_snapshot is not null and exists (
     select 1 from jsonb_array_elements(v_sale.items_snapshot) as item
     where item->>'serviceChannel'='equipment_rental'
   )) or (v_sale.product_id is not null and exists (
     select 1 from public.commercial_products cp where cp.id=v_sale.product_id
     and cp.channel='equipment_rental'
   ))
 ) then
   raise exception 'A venda não possui item de locação de equipamentos.'
     using errcode='23514';
 end if;

 if TG_OP='UPDATE' then
   if new.commercial_sale_id is distinct from old.commercial_sale_id
      or new.asset_id is distinct from old.asset_id
      or new.created_by is distinct from old.created_by then
     raise exception 'Não é permitido mover uma reserva para outra venda/aparelho.'
       using errcode='42501';
   end if;
   if old.status in ('returned','cancelled') then
     raise exception 'Reserva encerrada é imutável.' using errcode='42501';
   end if;
   if old.status in ('reserved','checked_out') and (
       new.start_at is distinct from old.start_at
       or new.end_at is distinct from old.end_at
       or new.daily_rate is distinct from old.daily_rate
       or new.agreed_total is distinct from old.agreed_total
       or new.deposit_amount is distinct from old.deposit_amount
     ) then
     raise exception 'Condições aprovadas exigem nova reserva/aditivo.'
       using errcode='42501';
   end if;
   if new.status is distinct from old.status and not (
       (old.status='draft' and new.status in ('reserved','cancelled'))
       or (old.status='reserved' and new.status in ('checked_out','cancelled'))
       or (old.status='checked_out' and new.status='returned')
     ) then
     raise exception 'Mudança de status de locação não permitida.' using errcode='23514';
   end if;
   if new.status='checked_out' and old.status<>'checked_out' and not exists (
     select 1 from public.rental_inspection_events i
     where i.booking_id=old.id and i.event_kind='checkout') then
     raise exception 'Registre vistoria de entrega antes de retirar o equipamento.'
       using errcode='23514';
   end if;
   if new.status='returned' and old.status<>'returned' and not exists (
     select 1 from public.rental_inspection_events i
     where i.booking_id=old.id and i.event_kind='return') then
     raise exception 'Registre vistoria de devolução antes de concluir.'
       using errcode='23514';
   end if;
 end if;
 return new;
end;
$$;
create trigger rental_bookings_verify before insert or update on public.rental_bookings
 for each row execute function public.enforce_rental_booking();

create or replace function public.enforce_rental_inspection()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_status text;
begin
 if TG_OP<>'INSERT' then
  raise exception 'A vistoria é prova imutável, não pode ser editada/apagada.'
    using errcode='42501';
 end if;
 select status into v_status from public.rental_bookings where id=new.booking_id for update;
 if v_status is null then
  raise exception 'Reserva inexistente.' using errcode='23514';
 end if;
 if (new.event_kind='checkout' and v_status<>'reserved')
  or (new.event_kind='return' and v_status<>'checked_out') then
  raise exception 'Vistoria não corresponde à etapa da locação.'
    using errcode='23514';
 end if;
 return new;
end;
$$;
create trigger rental_inspections_validate before insert or update or delete
on public.rental_inspection_events for each row
execute function public.enforce_rental_inspection();

-- Não permitir cancelar uma venda com aparelho reservado ou retirado.
create or replace function public.enforce_sale_active_rental()
returns trigger language plpgsql set search_path=''
as $$
begin
 if old.status is distinct from new.status and new.status='cancelled' and exists(
   select 1 from public.rental_bookings
   where commercial_sale_id=new.id and status in ('reserved','checked_out')
 ) then
   raise exception 'Há locação ativa: regularize/devolva antes de cancelar a venda.'
     using errcode='23514';
 end if;
 return new;
end;
$$;
create trigger commercial_sales_rental_guard before update on public.commercial_sales
 for each row execute function public.enforce_sale_active_rental();

alter table public.rental_assets enable row level security;
alter table public.rental_bookings enable row level security;
alter table public.rental_inspection_events enable row level security;
create policy rental_assets_read on public.rental_assets for select to authenticated
 using(public.staff_can_see_module('publicidade'));
create policy rental_assets_create on public.rental_assets for insert to authenticated
 with check(public.staff_can_module_action('publicidade','locacao_equipamentos_gerenciar'));
create policy rental_assets_update on public.rental_assets for update to authenticated
 using(public.staff_can_module_action('publicidade','locacao_equipamentos_gerenciar'))
 with check(public.staff_can_module_action('publicidade','locacao_equipamentos_gerenciar'));
create policy rental_bookings_read on public.rental_bookings for select to authenticated
 using(public.staff_can_see_module('publicidade'));
create policy rental_bookings_create on public.rental_bookings for insert to authenticated
 with check(public.staff_can_module_action('publicidade','locacao_reservas_gerenciar'));
create policy rental_bookings_update on public.rental_bookings for update to authenticated
 using(public.staff_can_module_action('publicidade','locacao_reservas_gerenciar'))
 with check(public.staff_can_module_action('publicidade','locacao_reservas_gerenciar'));
create policy rental_inspections_read on public.rental_inspection_events for select to authenticated
 using(public.staff_can_see_module('publicidade'));
create policy rental_inspections_create on public.rental_inspection_events for insert to authenticated
 with check(public.staff_can_module_action('publicidade','locacao_vistorias_registrar'));
-- Sem policies UPDATE/DELETE para provas de vistoria, inclusive para admin.

grant select,insert,update on public.rental_assets,public.rental_bookings to authenticated;
grant select,insert on public.rental_inspection_events to authenticated;
revoke delete on public.rental_assets,public.rental_bookings,public.rental_inspection_events from authenticated;

comment on table public.rental_assets is
 'Equipamentos individuais, não planos. Sem exclusão de histórico: manutenção/desativação.';
comment on table public.rental_bookings is
 'Reserva operacional vinculada a venda existente; não equivale a contrato assinado.';
comment on table public.rental_inspection_events is
 'Comprovantes imutáveis de retirada/devolução, sujeito a armazenamento privado das imagens.';
