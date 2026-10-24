-- A reserva e o estoque devem considerar o aparelho realmente em posse
-- do cliente, mesmo quando end_at já expirou. Nenhuma cobrança/caução
-- é movimentada por estas garantias.
-- Um só aparelho pode estar retirado de uma vez, independente do período.
create unique index rental_one_checked_out_per_asset
  on public.rental_bookings(asset_id) where status='checked_out';

-- Fix de concorrência: ao validar reserva travar a venda comercial.
-- Se uma venda está concluída com reserva antiga pendente, permitir
-- apenas sua devolução/cancelamento, jamais nova retirada.
create or replace function public.enforce_rental_booking()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_sale record; v_asset record; v_channel text;
begin
 select id,status,product_id,items_snapshot into v_sale
 from public.commercial_sales where id=new.commercial_sale_id for update;
 if v_sale.id is null then
   raise exception 'Venda de locação não encontrada.' using errcode='23514';
 end if;
 if v_sale.status not in ('approved','active') then
   -- Uma venda legada concluída não pode prender fisicamente um aparelho
   -- no painel. Permitir apenas devolver ou cancelar reserva já existente.
   if not (TG_OP='UPDATE' and v_sale.status='completed'
     and ((old.status='checked_out' and new.status='returned')
       or (old.status='reserved' and new.status='cancelled'))) then
     raise exception 'Reserva exige venda aprovada/ativa; após conclusão, apenas devolver ou cancelar pendências.'
       using errcode='23514';
   end if;
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
       and item->>'productId'=v_asset.product_id::text
   )) or (v_sale.product_id is not null and exists (
     select 1 from public.commercial_products cp where cp.id=v_sale.product_id and cp.id=v_asset.product_id
     and cp.channel='equipment_rental'
   ))
 ) then
   raise exception 'A venda não contém este produto de locação; confira os itens contratados.'
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

-- O UPDATE do booking trava a venda via enforce_rental_booking; 
-- o status "completed" da venda não é permitido com equipamento
-- reservado ou retirado, evitando pendências irrecuperáveis.
create function public.guard_sale_completion_with_rental()
returns trigger language plpgsql set search_path='' as $guard$
begin
 if old.status is distinct from new.status and new.status='completed'
   and exists(select 1 from public.rental_bookings b
     where b.commercial_sale_id=new.id and b.status in ('reserved','checked_out')) then
   raise exception 'Conclua a devolução/cancelamento de todas as locações antes de concluir a venda.'
     using errcode='23514';
 end if;
 return new;
end;
$guard$;
create trigger commercial_sale_complete_after_rental
 before update on public.commercial_sales
 for each row execute function public.guard_sale_completion_with_rental();

-- O trigger original de venda e de produto segue ativo.
-- Este roda DEPOIS de rental_bookings_verify (prefixo zz).
-- Locks na ordem venda→equipamento, para serializar reservas vs
-- retirada sem introduzir lock-order inverso.
create function public.guard_rental_in_hand()
returns trigger language plpgsql security definer set search_path='' as $guard$
begin
 if new.status in ('reserved','checked_out') then
   perform 1 from public.rental_assets
     where id=new.asset_id for update;
   if exists(select 1 from public.rental_bookings other_booking
      where other_booking.asset_id=new.asset_id
        and other_booking.status='checked_out'
        and other_booking.id is distinct from new.id) then
     raise exception 'Este equipamento segue retirado. Registre vistoria e devolução antes de confirmar outra reserva.'
       using errcode='23514';
   end if;
 end if;
 return new;
end;
$guard$;
create trigger zz_rental_bookings_in_hand_guard
 before insert or update on public.rental_bookings
 for each row execute function public.guard_rental_in_hand();

comment on index public.rental_one_checked_out_per_asset is
 'Nunca dois empréstimos ativos do mesmo patrimônio; fim previsto não equivale a devolução.';
