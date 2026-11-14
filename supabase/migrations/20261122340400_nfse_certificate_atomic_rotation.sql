-- NFS-e — substituicao atomica do certificado A1.
-- Preparada para revisao em branch isolada. NAO aplicar em producao sem
-- backup, revisao da ordem das migrations e homologacao com dados sinteticos.
--
-- Problema anterior: duas chamadas REST independentes (UPDATE active=false,
-- depois INSERT) podiam deixar o prestador SEM certificado ativo caso o INSERT
-- falhasse. A funcao abaixo executa a troca em UMA transacao PostgreSQL,
-- com lock na configuracao fiscal para serializar rotacoes concorrentes.
-- O servidor envia apenas a chave privada JA CIFRADA por AES-256-GCM.

create or replace function public.replace_nfse_certificate_atomic(
  p_issuer_config_id uuid,
  p_subject_cnpj text,
  p_subject_name text,
  p_issuer_name text,
  p_serial_number text,
  p_fingerprint text,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_certificate_pem text,
  p_private_key_ciphertext text,
  p_private_key_iv text,
  p_private_key_auth_tag text,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issuer_cnpj text;
  v_certificate_id uuid;
begin
  -- Bloqueia a linha-mestra da configuracao durante toda a transacao.
  -- Duas rotacoes simultaneas para o mesmo prestador ficam serializadas.
  select regexp_replace(cnpj, '[^0-9]', '', 'g')
    into v_issuer_cnpj
  from public.nfse_issuer_configs
  where id = p_issuer_config_id
  for update;

  if not found then
    raise exception 'Configuracao fiscal do prestador nao encontrada'
      using errcode = 'foreign_key_violation';
  end if;

  if p_subject_cnpj is distinct from v_issuer_cnpj then
    raise exception 'CNPJ do certificado nao corresponde ao prestador'
      using errcode = 'check_violation';
  end if;

  if p_valid_from is null or p_valid_until is null
     or p_valid_from > now() or p_valid_until <= now() then
    raise exception 'Certificado fora do periodo de validade'
      using errcode = 'check_violation';
  end if;

  update public.nfse_certificates
  set active = false
  where issuer_config_id = p_issuer_config_id and active = true;

  insert into public.nfse_certificates (
    issuer_config_id, subject_cnpj, subject_name, issuer_name,
    serial_number, fingerprint, valid_from, valid_until,
    certificate_pem, private_key_ciphertext, private_key_iv,
    private_key_auth_tag, active, created_by
  ) values (
    p_issuer_config_id, p_subject_cnpj, p_subject_name, p_issuer_name,
    p_serial_number, p_fingerprint, p_valid_from, p_valid_until,
    p_certificate_pem, p_private_key_ciphertext, p_private_key_iv,
    p_private_key_auth_tag, true, p_created_by
  ) returning id into v_certificate_id;

  -- Qualquer erro acima faz ROLLBACK tambem do UPDATE de desativacao.
  return v_certificate_id;
end;
$$;

-- Funcoes no Postgres concedem EXECUTE a PUBLIC por padrao: remover.
-- Apenas o cliente de servidor service_role pode acionar a rotacao.
revoke all on function public.replace_nfse_certificate_atomic(
  uuid, text, text, text, text, text, timestamptz, timestamptz,
  text, text, text, text, uuid
) from public, anon, authenticated;

grant execute on function public.replace_nfse_certificate_atomic(
  uuid, text, text, text, text, text, timestamptz, timestamptz,
  text, text, text, text, uuid
) to service_role;

-- O trigger antigo substituia SEMPRE created_by por auth.uid(), que e
-- NULL na chamada por service_role. Preservar o ator autenticado passado
-- exclusivamente pela RPC autorizada; outros roles nao podem forjar ator.
create or replace function public.set_nfse_certificate_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' then
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

comment on function public.replace_nfse_certificate_atomic(
  uuid, text, text, text, text, text, timestamptz, timestamptz,
  text, text, text, text, uuid
) is 'Troca atomica de A1 por prestador; recebe somente material ja criptografado; sem EXECUTE para anon/authenticated.';
