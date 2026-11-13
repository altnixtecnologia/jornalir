-- Banco PostgreSQL 16 descartavel da CI. So dados sinteticos.
begin;
create schema if not exists nfse_test;
create table nfse_test.requests (
  id bigserial primary key,
  issued_note_id uuid not null,
  status text not null check (status in ('pending','submitted','confirmed','rejected','uncertain'))
);
-- O indice precisa ser aplicado como no sistema real, inclusive uncertain.
create unique index nfse_cancel_unique_active
  on nfse_test.requests (issued_note_id)
  where status in ('pending','submitted','confirmed','uncertain');

do $$
declare
  v_note uuid := '00000000-0000-0000-0000-000000000001';
begin
  insert into nfse_test.requests(issued_note_id,status) values (v_note,'uncertain');
  begin
    insert into nfse_test.requests(issued_note_id,status) values (v_note,'pending');
    raise exception 'Falha: pedido duplicado foi permitido durante incerteza';
  exception when unique_violation then null;
  end;
  if (select count(*) from nfse_test.requests where issued_note_id=v_note) <> 1 then
    raise exception 'Falha: duplicado registrado';
  end if;
  -- Apenas uma rejeicao conclusiva libera novo pedido.
  update nfse_test.requests set status='rejected' where issued_note_id=v_note;
  insert into nfse_test.requests(issued_note_id,status) values(v_note,'pending');
  begin
    insert into nfse_test.requests(issued_note_id,status) values(v_note,'confirmed');
    raise exception 'Falha: segunda solicitacao ativa foi permitida';
  exception when unique_violation then null;
  end;
end
$$;
rollback;
select 'OK: cancelamento incerto bloqueia duplicidade; rejeicao definitiva permite novo pedido' as result;
