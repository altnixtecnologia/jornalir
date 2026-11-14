-- ASSERTIONS em Postgres descartavel; todos os dados sao sinteticos.
-- A fixture/schema e a migration devem ter sido aplicadas antes.
do $$
declare
  v_id uuid;
  v_active_id uuid;
  v_actor uuid := '00000000-0000-0000-0000-000000000003';
  v_signature text :=
    'public.replace_nfse_certificate_atomic(uuid,text,text,text,text,text,timestamp with time zone,timestamp with time zone,text,text,text,text,uuid)';
begin
  if has_function_privilege('anon', v_signature, 'EXECUTE')
     or has_function_privilege('authenticated', v_signature, 'EXECUTE')
     or not has_function_privilege('service_role', v_signature, 'EXECUTE') then
    raise exception 'Permissoes da RPC inseguras: apenas service_role pode executar';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', v_actor::text, true);

  -- O insert novo falha por NOT NULL. A desativacao anterior DEVE voltar.
  begin
    perform public.replace_nfse_certificate_atomic(
      '00000000-0000-0000-0000-000000000001',
      '00000000000000', 'NOVO SINTETICO', 'AC TESTE', 'NEW-SERIAL',
      null, -- fingerprint obrigatoria: provoca falha APOS UPDATE
      '2020-01-01T00:00:00Z', '2035-01-01T00:00:00Z',
      'SYNTHETIC-PEM-NEW', 'ENCRYPTED-FAKE-NEW', 'IV-NEW', 'TAG-NEW',
      v_actor
    );
    raise exception 'A chamada deveria falhar por NOT NULL no INSERT';
  exception
    when not_null_violation then null;
  end;

  select id into v_active_id from public.nfse_certificates
  where issuer_config_id = '00000000-0000-0000-0000-000000000001' and active;
  if v_active_id is distinct from '00000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'Certificado antigo foi desativado apos falha da troca';
  end if;

  -- Tentar outro CNPJ nem chega na desativacao.
  begin
    perform public.replace_nfse_certificate_atomic(
      '00000000-0000-0000-0000-000000000001',
      '11111111000111', 'NOVO SINTETICO', 'AC TESTE', 'NEW-SERIAL',
      'NEW-FINGERPRINT', '2020-01-01T00:00:00Z', '2035-01-01T00:00:00Z',
      'SYNTHETIC-PEM-NEW', 'ENCRYPTED-FAKE-NEW', 'IV-NEW', 'TAG-NEW',
      v_actor
    );
    raise exception 'CNPJ divergente deveria bloquear';
  exception
    when check_violation then null;
  end;

  select id into v_active_id from public.nfse_certificates
  where issuer_config_id = '00000000-0000-0000-0000-000000000001' and active;
  if v_active_id is distinct from '00000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'A falha de CNPJ alterou o ativo';
  end if;

  -- Agora a troca correta deve ser atomica e preservar o ator.
  select public.replace_nfse_certificate_atomic(
      '00000000-0000-0000-0000-000000000001',
      '00000000000000', 'NOVO SINTETICO', 'AC TESTE', 'NEW-SERIAL',
      'NEW-FINGERPRINT', '2020-01-01T00:00:00Z', '2035-01-01T00:00:00Z',
      'SYNTHETIC-PEM-NEW', 'ENCRYPTED-FAKE-NEW', 'IV-NEW', 'TAG-NEW',
      v_actor
  ) into v_id;
  if v_id is null then raise exception 'RPC nao retornou UUID'; end if;
  if (select count(*) from public.nfse_certificates where active) <> 1 then
    raise exception 'A troca nao deixou exatamente um certificado ativo';
  end if;
  if (select active from public.nfse_certificates
      where id = '00000000-0000-0000-0000-000000000002') then
    raise exception 'Certificado anterior ainda ativo apos troca bem sucedida';
  end if;
  if (select created_by from public.nfse_certificates where id = v_id)
      is distinct from v_actor then
    raise exception 'A auditoria perdeu o ator da troca';
  end if;
end;
$$;

select 'OK: A1 trocado atomicamente; rollback, CNPJ, ACL e auditoria validados' as result;
