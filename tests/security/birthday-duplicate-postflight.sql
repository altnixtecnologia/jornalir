-- Aniversariantes: nenhum acesso remoto, rollback do banco efêmero.
begin;
do $test$
declare
 a uuid;
 cnt integer;
begin
 insert into public.birthday_entries(origin,display_name,birth_month,birth_day,birth_year,active,publish_in_print)
 values('manual','Maria da Silva',3,10,null,true,false) returning id into a;
 -- Reenvio idêntico (e variação de espaços/caixa) jamais duplica.
 begin
   insert into public.birthday_entries(origin,display_name,birth_month,birth_day,birth_year,active,publish_in_print)
   values('manual','  MARIA   DA SILVA ',3,10,2000,true,false);
   raise exception 'Duplicidade editorial foi permitida.';
 exception when unique_violation then null;
 end;
 select count(*) into cnt from public.birthday_entries
  where birth_month=3 and birth_day=10 and active and source_client_id is null;
 if cnt<>1 then raise exception 'Reenvio inseriu duplicata.'; end if;
 -- Pessoas diferentes com data igual são possíveis.
 insert into public.birthday_entries(origin,display_name,birth_month,birth_day,birth_year,active,publish_in_print)
 values('manual','Outra pessoa',3,10,null,true,false);
 -- A mesma pessoa pode ter data corrigida após arquivamento, sem
 -- bloquear quem está inativo; reativar duplicata é proibido.
 insert into public.birthday_entries(origin,display_name,birth_month,birth_day,birth_year,active,publish_in_print)
 values('manual','Maria da Silva',3,10,null,false,false) returning id into a;
 begin
   update public.birthday_entries set active=true where id=a;
   raise exception 'Permitiu reativar registro duplicado.';
 exception when unique_violation then null;
 end;
 -- 29/02 não exige ano fictício: NULL persistido.
 insert into public.birthday_entries(origin,display_name,birth_month,birth_day,birth_year,active,publish_in_print)
 values('manual','Pessoa Bissexta',2,29,null,true,false);
 select count(*) into cnt from public.birthday_entries
  where display_name='Pessoa Bissexta' and birth_year is null;
 if cnt<>1 then raise exception 'Dia/mês sem ano não foi persistido corretamente.'; end if;
end;
$test$;
rollback;
select 'PASSOU: sem ano fictício, sem duplicatas no reenvio/reativação' as resultado;
