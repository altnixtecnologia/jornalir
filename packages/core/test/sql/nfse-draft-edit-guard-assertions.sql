-- Executado APOS setup.sql e migration; simula update direto pela Data API.
do $$
declare
  v_uuid uuid := '00000000-0000-0000-0000-000000000001';
begin
  if has_function_privilege('anon','public.guard_nfse_draft_fiscal_edit()','EXECUTE')
    or has_function_privilege('authenticated','public.guard_nfse_draft_fiscal_edit()','EXECUTE')
  then
    raise exception 'Trigger interno exposto aos usuarios da Data API';
  end if;

  -- Rascunho novo: editavel antes de qualquer tentativa.
  update public.nfse_drafts set service_value=120.00 where id=v_uuid;
  if (select service_value from public.nfse_drafts where id=v_uuid) != 120.00 then
    raise exception 'Rascunho novo deveria permitir edicao';
  end if;

  -- Claim nao pode disparar o trigger de edicao de snapshots.
  update public.nfse_drafts set transmission_locked_at=now() where id=v_uuid;

  begin
    update public.nfse_drafts set service_value=999.99 where id=v_uuid;
    raise exception 'Edicao durante claim deveria ser bloqueada';
  exception when sqlstate '55000' then null;
  end;

  if (select service_value from public.nfse_drafts where id=v_uuid) != 120.00 then
    raise exception 'Claim deixou valor alterado na corrida';
  end if;
  update public.nfse_drafts set transmission_locked_at=null where id=v_uuid;

  -- Tentativa pendente bloqueia edicao mesmo depois do release.
  insert into public.nfse_transmission_attempts(draft_id,status,created_at)
    values(v_uuid,'pending','2026-11-12T12:00:00Z');
  begin
    update public.nfse_drafts set competency_date='2026-11-13' where id=v_uuid;
    raise exception 'Tentativa pendente deveria bloquear edicao';
  exception when sqlstate '55000' then null;
  end;

  insert into public.nfse_transmission_attempts(draft_id,status,created_at)
    values(v_uuid,'uncertain','2026-11-12T12:01:00Z');
  begin
    update public.nfse_drafts set notes='texto' where id=v_uuid;
    raise exception 'Tentativa incerta deveria bloquear edicao';
  exception when sqlstate '55000' then null;
  end;

  -- Rejeicao definitiva subsequente: liberacao da edicao local.
  insert into public.nfse_transmission_attempts(draft_id,status,created_at)
    values(v_uuid,'rejected','2026-11-12T12:02:00Z');
  update public.nfse_drafts set service_value=180.00 where id=v_uuid;
  if (select service_value from public.nfse_drafts where id=v_uuid) != 180.00 then
    raise exception 'Rejeicao conclusiva nao desbloqueou edicao';
  end if;

  -- Mesmo com rejeicao mais recente, NFS-e autorizada bloqueia.
  insert into public.nfse_issued_notes(draft_id) values(v_uuid);
  begin
    update public.nfse_drafts set service_description='TEXTO ALTERADO' where id=v_uuid;
    raise exception 'Nota emitida deveria bloquear edicao';
  exception when sqlstate '55000' then null;
  end;

  -- Alteracao de status do rascunho protege snapshots em fluxo futuro.
  update public.nfse_drafts set status='authorized'
    where id='00000000-0000-0000-0000-000000000002';
  begin
    update public.nfse_drafts set tomador_name='OUTRO' where id='00000000-0000-0000-0000-000000000002';
    raise exception 'Status nao draft deveria bloquear edicao';
  exception when sqlstate '55000' then null;
  end;
end
$$;
select 'OK: snapshot fiscal imutavel durante claim, pending, uncertain e authorized' as validation;
