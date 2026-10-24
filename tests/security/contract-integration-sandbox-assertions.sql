-- PostgreSQL de teste: cadastro e historico de contratos com multiplos servicos.
-- Executar após migrations items_snapshot + equipment_rental.
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);

insert into public.commercial_products(id,name,channel)
 values('a0000000-0000-0000-0000-000000000001','Locação de projetor','equipment_rental');
insert into public.commercial_products(id,name,channel)
 values('a0000000-0000-0000-0000-000000000002','Publicidade LED','led_panel');

do $check$
declare
  original jsonb := '[{"sourceProposalItemId":"x-1","productId":"a0000000-0000-0000-0000-000000000001","productName":"Locação de projetor","serviceChannel":"equipment_rental","quantity":2,"unitPrice":100,"discountAmount":0,"totalAmount":200,"sortOrder":0},{"sourceProposalItemId":"x-2","productName":"LED","serviceChannel":"led_panel","quantity":1,"unitPrice":300,"discountAmount":25,"totalAmount":275,"sortOrder":1}]'::jsonb;
  rejected boolean;
begin
  insert into public.commercial_sales(id,client_id,proposal_id,status,amount,items_snapshot)
   values('a1000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000099','approved',475,original);

  if (select jsonb_array_length(items_snapshot) from public.commercial_sales
      where id='a1000000-0000-0000-0000-000000000001')<>2 then
      raise exception 'Itens dos serviços não foram preservados.';
  end if;

  rejected:=false;
  begin
    update public.commercial_sales
    set items_snapshot='[{"sourceProposalItemId":"outra"}]'::jsonb
    where id='a1000000-0000-0000-0000-000000000001';
  exception when others then rejected:=true;
  end;
  if not rejected then raise exception 'Condições históricas foram alteradas.'; end if;

  rejected:=false;
  begin
   insert into public.commercial_sales(id,client_id,proposal_id,status,amount,items_snapshot)
   values('a1000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000099','approved',475,original);
  exception when unique_violation then rejected:=true;
  end;
  if not rejected then raise exception 'Proposta convertida mais de uma vez.'; end if;

  rejected:=false;
  begin
   insert into public.commercial_sales(id,client_id,proposal_id,status,amount,items_snapshot)
   values('a1000000-0000-0000-0000-000000000003',
      '40000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000100','approved',100,'[]'::jsonb);
  exception when check_violation then rejected:=true;
  end;
  if not rejected then raise exception 'Snapshot de serviços vazio foi aceito.'; end if;
end;
$check$;

select 'PASSOU: locacao, venda multissservico e historico imutavel' as resultado;
