\set ON_ERROR_STOP on
-- Teste sintético, SEM OTP, usuário, dados reais ou chamada externa.
-- Executar só em PostgreSQL DESCARTÁVEL com schema fixture.

insert into public.contract_signature_invitations(id)
values ('00000000-0000-4000-8000-000000000401');
insert into public.commercial_signature_invitations(id)
values ('00000000-0000-4000-8000-000000000402');

-- A conta Google pertence exatamente a um convite, não substitui assinatura.
insert into public.contract_signature_google_evidence(
  commercial_invitation_id, provider_subject, verified_email, google_auth_user_id
) values (
  '00000000-0000-4000-8000-000000000402',
  'google-test-subject-001','signer@example.invalid',
  '00000000-0000-4000-8000-000000000411'
);
insert into public.contract_signature_google_evidence(
  institutional_invitation_id, provider_subject, verified_email, google_auth_user_id
) values (
  '00000000-0000-4000-8000-000000000401',
  'google-test-subject-002','other@example.invalid',
  '00000000-0000-4000-8000-000000000412'
);

do $$
begin
  -- Imutabilidade (nem service_role pode mudar a prova após aceitação).
  begin
    update public.contract_signature_google_evidence
    set verified_email='alterado@example.invalid'
    where commercial_invitation_id='00000000-0000-4000-8000-000000000402';
    raise exception 'UPDATE da prova Google deveria ser bloqueado.';
  exception when sqlstate '42501' then null;
  end;
  begin
    delete from public.contract_signature_google_evidence
    where institutional_invitation_id='00000000-0000-4000-8000-000000000401';
    raise exception 'DELETE da prova Google deveria ser bloqueado.';
  exception when sqlstate '42501' then null;
  end;

  -- A mesma conta/convite não pode sobrescrever seu evento anterior.
  begin
    insert into public.contract_signature_google_evidence(
      commercial_invitation_id,provider_subject,verified_email,google_auth_user_id
    ) values (
      '00000000-0000-4000-8000-000000000402',
      'google-test-subject-003','signer@example.invalid',
      '00000000-0000-4000-8000-000000000413'
    );
    raise exception 'Mesmo convite aceitou prova duplicada.';
  exception when unique_violation then null;
  end;

  -- Não atribuir a mesma prova simultaneamente ao cliente e instituição.
  begin
    insert into public.contract_signature_google_evidence(
      commercial_invitation_id,institutional_invitation_id,
      provider_subject,verified_email,google_auth_user_id
    ) values (
      '00000000-0000-4000-8000-000000000402',
      '00000000-0000-4000-8000-000000000401',
      'google-test-subject-004','signer@example.invalid',
      '00000000-0000-4000-8000-000000000414'
    );
    raise exception 'Prova Google vinculada a dois convites.';
  exception when check_violation then null;
  end;
end $$;

-- Nunca expor a tabela da prova Google ao browser por RLS/GRANTs.
do $$
begin
  if not (select relrowsecurity from pg_class where oid='public.contract_signature_google_evidence'::regclass)
    or has_table_privilege('anon','public.contract_signature_google_evidence','SELECT')
    or has_table_privilege('authenticated','public.contract_signature_google_evidence','SELECT')
    or has_table_privilege('anon','public.contract_signature_google_evidence','INSERT') then
    raise exception 'Google evidence não está privado.';
  end if;
end $$;

-- O editor estilo NixSign funciona só enquanto o modelo PDF é rascunho.
insert into public.contract_templates(id,document_mode,active,legal_approved_at) values
('00000000-0000-4000-8000-000000000421','fixed_pdf',false,null),
('00000000-0000-4000-8000-000000000422','fixed_pdf',false,now()),
('00000000-0000-4000-8000-000000000423','text',false,null);

insert into public.contract_signature_field_layouts(template_id,fields)
values ('00000000-0000-4000-8000-000000000421',
'[{"signerKey":"contratada-1","kind":"signature","page":1,"x":0.1,"y":0.2,"width":0.3,"height":0.1}]'::jsonb);
update public.contract_signature_field_layouts
set fields='[{"signerKey":"contratada-1","kind":"signature","page":1,"x":0.15,"y":0.2,"width":0.3,"height":0.1}]'::jsonb
where template_id='00000000-0000-4000-8000-000000000421';

update public.contract_templates set legal_approved_at=now()
where id='00000000-0000-4000-8000-000000000421';

do $$
begin
  begin
    update public.contract_signature_field_layouts set fields='[]'::jsonb
    where template_id='00000000-0000-4000-8000-000000000421';
    raise exception 'Layout aprovado foi modificado.';
  exception when raise_exception then
    -- Distinguir exceção da guarda da nossa asserção por mensagem.
    if sqlerrm not like 'Posicionamento permitido%' then raise; end if;
  end;

  begin
    delete from public.contract_signature_field_layouts
    where template_id='00000000-0000-4000-8000-000000000421';
    raise exception 'Layout aprovado foi removido.';
  exception when raise_exception then
    if sqlerrm not like 'Posicionamento permitido%' then raise; end if;
  end;

  begin
    insert into public.contract_signature_field_layouts(template_id,fields)
    values ('00000000-0000-4000-8000-000000000422','[]'::jsonb);
    raise exception 'Layout novo em modelo já aprovado.';
  exception when raise_exception then
    if sqlerrm not like 'Posicionamento permitido%' then raise; end if;
  end;

  begin
    insert into public.contract_signature_field_layouts(template_id,fields)
    values ('00000000-0000-4000-8000-000000000423','[]'::jsonb);
    raise exception 'Modelo de texto recebeu layout manual.';
  exception when raise_exception then
    if sqlerrm not like 'Posicionamento permitido%' then raise; end if;
  end;
end $$;

select 'PASS: prova Google privada/imutável e posição PDF congelada após aprovação' as result;
