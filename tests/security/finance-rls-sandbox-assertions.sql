-- Executar DEPOIS das duas migrations de segurança no PostgreSQL
-- temporário. ASSERTIONS com contas falsas, sem recursos de produção.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $test$
begin
  if public.is_active_staff() or public.staff_can_see_module('financeiro')
     or public.staff_can_finance_action('titulos_criar') then
    raise exception 'Convidado sem confirmação recebeu acesso.';
  end if;
  if (select count(*) from public.receivables)<>0 then
    raise exception 'Convidado sem confirmação pode consultar financeiro.';
  end if;
end;
$test$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $test$
declare
  rejected boolean;
  n integer;
begin
  if not public.is_active_staff() or not public.staff_can_see_module('financeiro')
     or not public.staff_can_finance_action('titulos_criar')
     or public.staff_can_finance_action('recebimentos_baixar')
     or public.staff_can_finance_action('titulos_cancelar')
     or public.staff_can_finance_action('relatorios_exportar') then
    raise exception 'Matriz do operador não corresponde às concessões.';
  end if;
  if (select count(*) from public.receivables)<>1 then
    raise exception 'Operador com Financeiro deve poder visualizar títulos.';
  end if;

  -- 'Criar' não pode forjar um título pago.
  rejected := false;
  begin
    insert into public.receivables(id,original_amount,status)
      values('10000000-0000-0000-0000-000000000002',200,'paid');
  exception when others then rejected:=true;
  end;
  if not rejected then raise exception 'Criador forjou título pago.'; end if;

  insert into public.receivables(id,original_amount,status)
    values('10000000-0000-0000-0000-000000000002',200,'open');

  rejected := false;
  begin
    update public.receivables set original_amount=0
    where id='10000000-0000-0000-0000-000000000002';
  exception when others then rejected:=true;
  end;
  if not rejected then raise exception 'Criador alterou valor do título.'; end if;

  rejected := false;
  begin
    insert into public.receivable_receipts(id,receivable_id,amount)
      values('20000000-0000-0000-0000-000000000001',
             '10000000-0000-0000-0000-000000000002',50);
  exception when others then rejected:=true;
  end;
  if not rejected then raise exception 'Criador fez baixa sem autorização.'; end if;

  rejected:=false;
  n:=0;
  begin
    update public.receivables set status='cancelled'
      where id='10000000-0000-0000-0000-000000000002';
    get diagnostics n=row_count;
  exception when others then rejected:=true;
  end;
  if not rejected and n<>0 then raise exception 'Cancelamento sem direito foi executado.'; end if;
end;
$test$;

-- O administrador poderá liberar baixa sem liberar edição/cancelamento.
reset role;
insert into public.staff_finance_action_permissions(profile_id,action_key,allowed)
values('00000000-0000-0000-0000-000000000002','recebimentos_baixar',true);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $test$
declare
  rejected boolean;
begin
  if public.staff_can_finance_action('titulos_cancelar') or
     public.staff_can_finance_action('titulos_editar') then
    raise exception 'Baixa concedeu poderes inesperados.';
  end if;
  rejected:=false;
  begin
    update public.receivables set status='paid'
    where id='10000000-0000-0000-0000-000000000002';
  exception when others then rejected:=true;
  end;
  if not rejected then raise exception 'Operador quitou título sem recibo.'; end if;

  insert into public.receivable_receipts(id,receivable_id,amount)
    values('20000000-0000-0000-0000-000000000002',
           '10000000-0000-0000-0000-000000000002',50);
  update public.receivables set status='partially_paid'
    where id='10000000-0000-0000-0000-000000000002';
  if (select status from public.receivables
      where id='10000000-0000-0000-0000-000000000002')<>'partially_paid' then
    raise exception 'Baixa parcial não atualizou status.';
  end if;
  rejected:=false;
  begin
    insert into public.receivable_receipts(id,receivable_id,amount)
      values('20000000-0000-0000-0000-000000000003',
             '10000000-0000-0000-0000-000000000002',999);
  exception when others then rejected:=true;
  end;
  if not rejected then raise exception 'Permitido recebimento acima do saldo.'; end if;

  begin
    update public.receivables set status='cancelled'
      where id='10000000-0000-0000-0000-000000000002';
  exception when others then null;
  end;
  if (select status from public.receivables
      where id='10000000-0000-0000-0000-000000000002')='cancelled' then
    raise exception 'Operador cancelou com permissão apenas de baixa.';
  end if;
end;
$test$;

-- Desabilitar Financeiro corta inclusive leitura RLS,
-- independentemente das concessões individuais ainda gravadas.
reset role;
update public.staff_module_visibility set enabled=false
where profile_id='00000000-0000-0000-0000-000000000002' and module_key='financeiro';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $test$
begin
  if public.staff_can_finance_action('titulos_criar')
     or (select count(*) from public.receivables)<>0 then
    raise exception 'Módulo oculto ainda deixou Financeiro acessível.';
  end if;
end;
$test$;

-- Proprietário confirmado continua com acesso integral.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $test$
begin
  if not public.is_active_admin_or_owner()
     or not public.staff_can_finance_action('titulos_cancelar')
     or (select count(*) from public.receivables)<2 then
    raise exception 'Regressão de permissão do proprietário.';
  end if;
end;
$test$;
reset role;
select 'PASSOU: aceite de convite + baixa + cancelamento + RLS' as resultado;
