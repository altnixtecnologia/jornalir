-- CI exclusivamente em PostgreSQL descartavel: modelos de teste, SEM dados reais.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table public.profiles (id uuid primary key);
create table public.clients (
  id uuid primary key,
  email text,
  fiscal_email text
);
create table public.nfse_issued_notes (
  id uuid primary key,
  client_id uuid not null references public.clients(id),
  environment text not null,
  nfse_xml text
);
\i supabase/migrations/20261122340650_nfse_delivery_history_tables.sql
\i supabase/migrations/20261122340700_nfse_delivery_enqueue_trigger.sql
insert into public.clients(id,email,fiscal_email) values
('00000000-0000-0000-0000-000000000111','principal@exemplo.test','fiscal@exemplo.test'),
('00000000-0000-0000-0000-000000000112','principal2@exemplo.test',null),
('00000000-0000-0000-0000-000000000113',null,null);
insert into public.nfse_issued_notes(id,client_id,environment) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000111','production'),
('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000112','production'),
('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000113','production'),
('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000111','homologation');
do $$
begin
  if (select count(*) from public.nfse_delivery_attempts) <> 3 then
    raise exception 'Numero incorreto de filas automaticas';
  end if;
  if (select recipient_snapshot from public.nfse_delivery_attempts where issued_note_id='00000000-0000-0000-0000-000000000001') <> 'fiscal@exemplo.test' then
    raise exception 'Nao preferiu email fiscal';
  end if;
  if (select recipient_snapshot from public.nfse_delivery_attempts where issued_note_id='00000000-0000-0000-0000-000000000002') <> 'principal2@exemplo.test' then
    raise exception 'Nao aplicou fallback email principal';
  end if;
  if (select status from public.nfse_delivery_attempts where issued_note_id='00000000-0000-0000-0000-000000000003') <> 'queued' then
    raise exception 'Sem destinatario precisa manter fila para arquivar os documentos';
  end if;
  if exists(select 1 from public.nfse_delivery_attempts where issued_note_id='00000000-0000-0000-0000-000000000004') then
    raise exception 'Homologacao nao pode enfileirar email real';
  end if;
  if has_table_privilege('authenticated','public.nfse_delivery_attempts','SELECT') or
     has_table_privilege('anon','public.nfse_document_assets','SELECT') then
    raise exception 'Historico fiscal foi exposto para cliente publico';
  end if;
end
$$;
-- O indice unico da migration ja foi aplicado.
do $$
begin
  begin
    insert into public.nfse_delivery_attempts
    (issued_note_id,channel,origin,status,recipient_snapshot)
    values('00000000-0000-0000-0000-000000000001','email','manual','queued','teste@exemplo.test');
    raise exception 'Fila concorrente permitida';
  exception when unique_violation then null;
  end;
end
$$;
select 'OK - destinatarios snapshot, fila idempotente, isolamento, RLS e nao duplicidade' as resultado;
