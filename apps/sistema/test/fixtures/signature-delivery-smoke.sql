\set ON_ERROR_STOP on
-- Script exclusivamente de homologação de SQL em banco DESCARTÁVEL.
-- Precisa executar antes: signature-delivery-schema.sql,
-- 20261122240000_signature_final_delivery_outbox.sql e
-- 20261122250000_commercial_signature_whatsapp_delivery.sql.

insert into public.commercial_signature_requests(id,status)
values ('00000000-0000-4000-8000-000000000101','pending');
insert into public.commercial_signature_participants(id,signer_role,signer_name,signer_email)
values
('00000000-0000-4000-8000-000000000201','contratante','Pessoa Teste','teste1@example.invalid'),
('00000000-0000-4000-8000-000000000202','testemunha','Testemunha Teste','teste2@example.invalid');
insert into public.commercial_signature_invitations(id,request_id,participant_id,status)
values
('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000201','signed'),
('00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000202','signed');
update public.commercial_signature_requests set status='completed'
where id='00000000-0000-4000-8000-000000000101';

insert into public.contract_signature_requests(id,status)
values ('00000000-0000-4000-8000-000000000102','pending');
insert into public.contract_signature_invitations(id,request_id,status)
values
('00000000-0000-4000-8000-000000000303','00000000-0000-4000-8000-000000000102','signed'),
('00000000-0000-4000-8000-000000000304','00000000-0000-4000-8000-000000000102','signed');
update public.contract_signature_requests set status='completed'
where id='00000000-0000-4000-8000-000000000102';

insert into public.contract_signature_invitations(id,request_id,status)
values ('00000000-0000-4000-8000-000000000305',null,'pending');
update public.contract_signature_invitations set status='signed'
where id='00000000-0000-4000-8000-000000000305';

do $$
declare n integer;
begin
  select count(*) into n from public.contract_signature_delivery_outbox;
  if n<>8 then raise exception 'Esperava 8 notificações de conclusão, obtive %',n; end if;
  select count(*) into n from public.contract_signature_delivery_outbox
    where modality='commercial' and channel='email_final';
  if n<>2 then raise exception 'Convite comercial: e-mails duplicados ou ausentes (%).',n; end if;
  select count(*) into n from public.contract_signature_delivery_outbox
    where modality='institutional' and channel='telegram_staff';
  if n<>2 then raise exception 'Telegram institucional: avisos incorretos (%).',n; end if;
  if not (select relrowsecurity from pg_class where oid='public.contract_signature_delivery_outbox'::regclass) then
    raise exception 'RLS da fila não habilitada.';
  end if;
  if has_table_privilege('anon','public.contract_signature_delivery_outbox','SELECT')
     or has_table_privilege('authenticated','public.contract_signature_delivery_outbox','SELECT') then
    raise exception 'Fila de notificações exposta ao público.';
  end if;
  if has_function_privilege('anon','public.claim_contract_signature_delivery(integer)','EXECUTE') then
    raise exception 'RPC claim exposta ao público.';
  end if;
end
$$;

-- Uma segunda mudança artificial de status não pode enfileirar duplicatas.
update public.commercial_signature_requests set status='completed'
where id='00000000-0000-4000-8000-000000000101';
do $$
begin
  if (select count(*) from public.contract_signature_delivery_outbox)<>8 then
    raise exception 'Fila duplicada após atualização repetida.';
  end if;
end
$$;

-- Reserva concorrente/segura. Lote máximo 4, jamais pega item já em envio.
select count(*) as claimed from public.claim_contract_signature_delivery(4);
do $$
declare n integer; job uuid;
begin
  select count(*) into n from public.contract_signature_delivery_outbox where status='sending';
  if n<>4 then raise exception 'Claim deveria reservar quatro, reservou %.',n; end if;
  select id into job from public.contract_signature_delivery_outbox where status='sending' limit 1;
  perform public.finish_contract_signature_delivery(job,'sent','test-provider-message-001',null);
  if not exists(select 1 from public.contract_signature_delivery_outbox where id=job
    and status='sent' and provider_message_id='test-provider-message-001') then
    raise exception 'Finalização e ID de provedor não foram gravados.';
  end if;
  if not exists(select 1 from public.audit_events where entity_id=job
    and action='signature_notification_sent') then
    raise exception 'Auditoria da entrega não foi gravada.';
  end if;
end
$$;

-- Timeout não é reencaminhado automaticamente: fica como uncertain.
update public.contract_signature_delivery_outbox
set claimed_at=now()-interval '20 minutes' where status='sending';
select public.mark_stale_contract_signature_deliveries();
do $$
declare n integer;
begin
  select count(*) into n from public.contract_signature_delivery_outbox where status='uncertain';
  if n<>3 then raise exception 'Timeout: % pendências incertas, esperado 3.',n; end if;
  if exists(select 1 from public.contract_signature_delivery_outbox
    where status='uncertain' and last_error is null) then
    raise exception 'Entrega incerta sem instrução para reconciliação.';
  end if;
end
$$;

-- Meta: accepted_by_meta EXIGE identificador. Sem ele, estado fica uncertain.
update public.commercial_signature_invitations
set notification_channel='whatsapp',
notification_status='accepted_by_meta',
notification_message_id='wamid.test',
notification_attempted_at=now()
where id='00000000-0000-4000-8000-000000000301';
do $$
begin
  begin
    update public.commercial_signature_invitations
    set notification_status='accepted_by_meta',
        notification_channel='whatsapp',notification_message_id=null
    where id='00000000-0000-4000-8000-000000000302';
    raise exception 'Aceitação sem ID Meta deveria ser bloqueada.';
  exception when check_violation then
    null;
  end;
end
$$;

select 'PASS: filas de conclusão, RLS, idempotência, claim, auditoria, timeout e Meta' as result;
