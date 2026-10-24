-- Simulação de locação com dois horários e um único aparelho.
-- Status, conflitos e vistorias são verificados sem tocar produção.
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
insert into public.rental_assets(
 id,product_id,asset_code,brand,model,serial_number,status
)values(
 'b0000000-0000-0000-0000-000000000001',
 'a0000000-0000-0000-0000-000000000001',
 'PROJETOR-001','Marca fictícia','Modelo teste','SERIAL-X1','available'
);
-- Produto LED não é equipamento de locação.
do $test$
declare rejected boolean:=false;
begin
 begin
  insert into public.rental_assets(id,product_id,asset_code,brand,model) values
   ('b0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000002','LED-INVALIDO','Marca','Modelo');
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Equipamento associado a canal não alugável.'; end if;
end;
$test$;

-- Operador com os três direitos cadastrados consegue usar o inventário.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $test$
begin
 if not public.staff_can_module_action('publicidade','locacao_reservas_gerenciar')
    or (select count(*) from public.rental_assets)<>1 then
    raise exception 'Usuário de locação perdeu acesso ao equipamento.';
 end if;
end;
$test$;
insert into public.rental_bookings(id,commercial_sale_id,asset_id,start_at,end_at,
 collection_location,return_location,contact_person,daily_rate,agreed_total,deposit_amount)
values('b1000000-0000-0000-0000-000000000001',
 'a1000000-0000-0000-0000-000000000001',
 'b0000000-0000-0000-0000-000000000001',
 '2026-11-05T12:00:00Z','2026-11-07T12:00:00Z',
 'Retirada teste','Devolução teste','Responsável fictício',150,300,50);

-- Dois rascunhos sobrepostos são permitidos, mas confirmação dupla NÃO.
insert into public.rental_bookings(id,commercial_sale_id,asset_id,start_at,end_at,
 collection_location,return_location,contact_person,daily_rate,agreed_total,deposit_amount)
values('b1000000-0000-0000-0000-000000000002',
 'a1000000-0000-0000-0000-000000000001',
 'b0000000-0000-0000-0000-000000000001',
 '2026-11-06T12:00:00Z','2026-11-08T12:00:00Z',
 'Retirada teste','Devolução teste','Outro responsável',150,300,0);

update public.rental_bookings set status='reserved'
 where id='b1000000-0000-0000-0000-000000000001';
do $test$
declare rejected boolean:=false;
begin
 begin
  update public.rental_assets set serial_number='SERIE-FALSIFICADA'
  where id='b0000000-0000-0000-0000-000000000001';
 exception when others then rejected:=true;
 end;
 if not rejected then
  raise exception 'Identidade do equipamento foi reescrita após reservar.';
 end if;
end;
$test$;


do $test$
declare rejected boolean:=false;
begin
 begin
  update public.rental_bookings set status='reserved'
  where id='b1000000-0000-0000-0000-000000000002';
 exception when exclusion_violation then rejected:=true;
 end;
 if not rejected then raise exception 'Reservas duplas no mesmo período autorizadas.'; end if;
end;
$test$;

do $test$
declare rejected boolean:=false;
begin
 begin
  update public.rental_bookings set status='checked_out'
  where id='b1000000-0000-0000-0000-000000000001';
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Retirada sem vistoria autorizada.'; end if;
end;
$test$;

insert into public.rental_inspection_events(id,booking_id,event_kind,condition_notes,
 accessories_checklist,acknowledged_by)values(
 'b2000000-0000-0000-0000-000000000001',
 'b1000000-0000-0000-0000-000000000001',
 'checkout','Estado de entrega registrado','["Cabo","Controle"]'::jsonb,'Responsável fictício'
);
update public.rental_bookings set status='checked_out'
 where id='b1000000-0000-0000-0000-000000000001';

-- A data prevista termina, mas a posse física não: reserva futura
-- somente depois da vistoria e devolução efetiva.
insert into public.rental_bookings(id,commercial_sale_id,asset_id,start_at,end_at,
 collection_location,return_location,contact_person,daily_rate,agreed_total,deposit_amount)
values('b1000000-0000-0000-0000-000000000003',
 'a1000000-0000-0000-0000-000000000001',
 'b0000000-0000-0000-0000-000000000001',
 '2026-11-10T12:00:00Z','2026-11-12T12:00:00Z',
 'Retirada futura','Devolução futura','Outro cliente fictício',150,300,0);
do $test$
declare rejected boolean:=false;
begin
 begin
  update public.rental_bookings set status='reserved'
   where id='b1000000-0000-0000-0000-000000000003';
 exception when check_violation then rejected:=true;
 end;
 if not rejected then raise exception 'Prazo vencido liberou aparelho ainda retirado.'; end if;
end;
$test$;

do $test$
declare rejected boolean:=false;
begin
 begin
  update public.commercial_sales set status='completed'
   where id='a1000000-0000-0000-0000-000000000001';
 exception when check_violation then rejected:=true;
 end;
 if not rejected then raise exception 'Venda concluída com aparelho não devolvido.'; end if;
end;
$test$;

do $test$
declare rejected boolean:=false;
begin
 begin
  update public.rental_inspection_events set condition_notes='alteração proibida'
   where id='b2000000-0000-0000-0000-000000000001';
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Vistoria original foi editada.'; end if;
end;
$test$;

-- Reserva retirada impede cancelamento da venda que a originou.
do $test$
declare rejected boolean:=false;
begin
 begin
  update public.commercial_sales set status='cancelled'
   where id='a1000000-0000-0000-0000-000000000001';
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Venda cancelada com item ainda emprestado.'; end if;
end;
$test$;

do $test$
declare rejected boolean:=false;
begin
 begin
  update public.rental_bookings set status='returned'
   where id='b1000000-0000-0000-0000-000000000001';
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Devolução sem vistoria autorizada.'; end if;
end;
$test$;

insert into public.rental_inspection_events(id,booking_id,event_kind,condition_notes,
 accessories_checklist,acknowledged_by)values(
 'b2000000-0000-0000-0000-000000000002',
 'b1000000-0000-0000-0000-000000000001',
 'return','Estado de devolução conferido','["Cabo","Controle"]'::jsonb,'Responsável fictício'
);
update public.rental_bookings set status='returned'
 where id='b1000000-0000-0000-0000-000000000001';

-- Depois de devolução/vistoria, confirmar novas reservas.
update public.rental_bookings set status='reserved'
 where id='b1000000-0000-0000-0000-000000000002';
update public.rental_bookings set status='reserved'
 where id='b1000000-0000-0000-0000-000000000003';

do $test$
declare rejected boolean:=false;
begin
 begin
  update public.commercial_sales set status='completed'
   where id='a1000000-0000-0000-0000-000000000001';
 exception when check_violation then rejected:=true;
 end;
 if not rejected then raise exception 'Venda concluída com reserva ainda pendente.'; end if;
end;
$test$;

-- Operador perde leitura e operações se o módulo deixar de ser visível.
reset role;
update public.staff_module_visibility set enabled=false
 where profile_id='00000000-0000-0000-0000-000000000002'
 and module_key='publicidade';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $test$
begin
 if (select count(*) from public.rental_assets)<>0
  or (select count(*) from public.rental_bookings)<>0
  or public.staff_can_module_action('publicidade','locacao_reservas_gerenciar') then
  raise exception 'Operador sem módulo continua acessando locações.';
 end if;
end;
$test$;
reset role;
select 'PASSOU: série, reserva sem conflito, vistoria, devolução e RLS' as resultado;
