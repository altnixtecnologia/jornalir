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
  nfse_xml text,
  access_key text,
  created_at timestamptz not null default now()
);
\i supabase/migrations/20261114000402_nfse_delivery_history_tables.sql
\i supabase/migrations/20261122340700_nfse_delivery_enqueue_trigger.sql
\i supabase/migrations/20261122340900_nfse_archive_retry_claim.sql
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

-- Fila de arquivo no DB real: mais de 50 notas e 3 falhas persistentes
-- nao devem impedir progresso das demais. Nada deste fixture toca producao.
insert into public.nfse_issued_notes(id,client_id,environment,nfse_xml,access_key,created_at)
select ('00000000-0000-0000-0000-' || lpad(gs::text,12,'0'))::uuid,
       '00000000-0000-0000-0000-000000000111'::uuid, 'production',
       '<NFSe/>','CHAVE_TESTE', now() - gs * interval '1 second'
from generate_series(100,160) gs;

create temporary table archive_claim_first as
select note_id from public.claim_pending_nfse_archive(3);
do $$
begin
  if (select count(*) from archive_claim_first) <> 3 then
    raise exception 'Claim inicial nao trouxe 3 notas';
  end if;
  if not exists (select 1 from archive_claim_first
    where note_id='00000000-0000-0000-0000-000000000160'::uuid) then
    raise exception 'Claim ignorou a nota elegivel mais antiga (>50 notas)';
  end if;
end
$$;
select public.defer_nfse_archive_failure(note_id) from archive_claim_first;
do $$
begin
  if (select count(*) from public.nfse_archive_retry_state
      where issued_note_id in (select note_id from archive_claim_first)
        and failures=1 and next_attempt_at>now()) <> 3 then
    raise exception 'Falhas de arquivo nao receberam backoff persistente';
  end if;
end
$$;
create temporary table archive_claim_second as
select note_id from public.claim_pending_nfse_archive(3);
do $$
begin
  if (select count(*) from archive_claim_second) <> 3 then
    raise exception 'Falhas bloquearam o processamento de outras notas';
  end if;
  if exists (select 1 from archive_claim_second
     where note_id in (select note_id from archive_claim_first)) then
    raise exception 'Falhas retentadas imediatamente ignorando backoff';
  end if;
  if has_function_privilege('authenticated',
      'public.claim_pending_nfse_archive(integer)', 'EXECUTE') then
    raise exception 'Claim fiscal acessivel por usuario nao administrativo';
  end if;
end
$$;
select 'OK - claim atomico de 61 notas, backoff e isolamento da fila R2' as resultado;
