-- Banco PostgreSQL 16 descartavel da CI, NENHUMA tabela fiscal real.
-- Recria o indice ANTERIOR e aplica a migration NOVA de verdade.
begin;
create table public.nfse_cancellation_requests (
  id bigserial primary key,
  issued_note_id uuid not null,
  status text not null check (status in ('pending','submitted','confirmed','rejected','uncertain'))
);
create unique index idx_nfse_cancellation_one_active_per_note
  on public.nfse_cancellation_requests (issued_note_id)
  where status in ('pending','submitted','confirmed');
commit;

\i supabase/migrations/20261122340600_nfse_cancellation_uncertain_uniqueness.sql

do $$
declare
  v_note uuid := '00000000-0000-0000-0000-000000000001';
begin
  insert into public.nfse_cancellation_requests(issued_note_id,status) values (v_note,'uncertain');
  begin
    insert into public.nfse_cancellation_requests(issued_note_id,status) values (v_note,'pending');
    raise exception 'Falha: pedido duplicado foi permitido durante incerteza';
  exception when unique_violation then null;
  end;
  if (select count(*) from public.nfse_cancellation_requests where issued_note_id=v_note) <> 1 then
    raise exception 'Falha: duplicado registrado';
  end if;
  update public.nfse_cancellation_requests set status='rejected' where issued_note_id=v_note;
  insert into public.nfse_cancellation_requests(issued_note_id,status) values(v_note,'pending');
  begin
    insert into public.nfse_cancellation_requests(issued_note_id,status) values(v_note,'confirmed');
    raise exception 'Falha: segunda solicitacao ativa foi permitida';
  exception when unique_violation then null;
  end;
end
$$;
select 'OK: migration real impede duplicidade com resultado incerto' as result;
