-- Bloco D — Página pública de complementação cadastral (02/11/2026).
-- Consome a infraestrutura de 20261120300000_client_completion_tokens.sql
-- (token com hash, expiração, rate limit de código) para o interessado
-- efetivamente completar o próprio cadastro pela página pública, que
-- antes não existia. NÃO aplicada ainda — mesmo princípio das migrations
-- anteriores deste módulo (desenvolver agora, aplicar depois de
-- homologação). Nenhuma função aqui cria um client novo nem duplica
-- CPF/CNPJ: todas operam sobre o client_id já vinculado ao token.
--
-- Todas as funções abaixo são SECURITY DEFINER e só podem ser chamadas
-- pela camada de serviço (service_role) — a Server Action correspondente
-- em apps/sistema roda com o cliente admin, nunca com o publishable key
-- direto do navegador, mesmo padrão de assinatura comercial
-- (finalize_commercial_signature etc.).

-- Helper interno (não exposto): valida o token e devolve o client_id,
-- centralizando a checagem repetida pelas funções públicas abaixo.
-- "antes de exibir ou modificar dados já existentes, exigir verificação
-- de posse de canal" — por isso toda leitura/escrita aqui exige
-- status='verified' (nunca 'pending') e o mesmo verified_user_id que
-- completou o OTP, não apenas um token_sha256 correto.
create or replace function public.require_verified_client_completion(
  p_token_sha256 text,
  p_auth_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Somente serviço.' using errcode = '42501';
  end if;
  select client_id, status, expires_at, verified_user_id into v_row
    from public.client_completion_tokens
    where token_sha256 = p_token_sha256
    for update;
  if not found or v_row.status <> 'verified' or v_row.expires_at <= now()
     or v_row.verified_user_id is distinct from p_auth_user_id then
    raise exception 'Link indisponível, expirado ou não verificado.' using errcode = '23514';
  end if;
  return v_row.client_id;
end;
$$;

revoke all on function public.require_verified_client_completion(text, uuid) from public, anon, authenticated;
grant execute on function public.require_verified_client_completion(text, uuid) to service_role;

comment on function public.require_verified_client_completion(text, uuid) is
  'Valida token+posse de canal já verificada (status=verified, mesmo verified_user_id, não expirado) e devolve o client_id. Usado por toda leitura/escrita do fluxo público de complementação cadastral.';

-- Leitura — prefill do formulário público depois do OTP confirmado.
-- Nunca expõe CPF/CNPJ completo (a identidade não é editável por este
-- link); devolve só o necessário para o próprio titular revisar/completar
-- os próprios dados e os familiares/pessoas vinculadas já cadastrados.
create or replace function public.get_client_completion_snapshot(
  p_token_sha256 text,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
  v_result jsonb;
begin
  v_client_id := public.require_verified_client_completion(p_token_sha256, p_auth_user_id);

  select jsonb_build_object(
    'clientId', c.id,
    'kind', c.kind,
    'fullName', c.full_name,
    'companyName', c.company_name,
    'tradeName', c.trade_name,
    'birthDate', c.birth_date,
    'foundingDate', c.founding_date,
    'phonePrimary', c.phone_primary,
    'whatsapp', c.whatsapp,
    'email', c.email,
    'addressZip', c.address_zip,
    'addressStreet', c.address_street,
    'addressNumber', c.address_number,
    'addressComplement', c.address_complement,
    'addressNeighborhood', c.address_neighborhood,
    'addressCity', c.address_city,
    'addressState', c.address_state,
    'familyMembersConfirmedEmpty', c.family_members_confirmed_empty,
    'familyMembers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'displayName', b.display_name, 'relationship', b.relationship,
        'birthMonth', b.birth_month, 'birthDay', b.birth_day, 'consentStatus', b.consent_status
      ) order by b.created_at)
      from public.birthday_entries b
      where b.group_client_id = c.id and b.origin = 'familiar' and b.active
    ), '[]'::jsonb),
    'relatedPersons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'fullName', r.full_name, 'roleType', r.role_type,
        'phone', r.phone, 'email', r.email
      ) order by r.created_at)
      from public.client_related_persons r
      where r.client_id = c.id and r.active
    ), '[]'::jsonb),
    'titularConsent', (
      select b.consent_status from public.birthday_entries b
      where b.origin = 'cadastro' and b.source_client_id = c.id
    )
  ) into v_result
  from public.clients c
  where c.id = v_client_id;

  return v_result;
end;
$$;

revoke all on function public.get_client_completion_snapshot(text, uuid) from public, anon, authenticated;
grant execute on function public.get_client_completion_snapshot(text, uuid) to service_role;

comment on function public.get_client_completion_snapshot(text, uuid) is
  'Prefill da página pública de complementação cadastral, só depois do OTP confirmado (ver require_verified_client_completion). Nunca expõe CPF/CNPJ.';

-- Adicionar familiar (dia/mês sem ano) pelo próprio titular PF, pela
-- página pública — mesma tabela/regra de negócio de addFamilyMemberAction
-- (complementacao-actions.ts), só que validada contra o token em vez de
-- is_active_staff(). "Consentimento para publicação nunca presumido":
-- publish_in_print só fica true quando p_consent = true (a própria
-- CHECK birthday_entries_publish_requires_consent garante isso).
create or replace function public.public_complete_add_family_member(
  p_token_sha256 text,
  p_auth_user_id uuid,
  p_display_name text,
  p_relationship text,
  p_birth_month int,
  p_birth_day int,
  p_consent boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
  v_id uuid;
begin
  v_client_id := public.require_verified_client_completion(p_token_sha256, p_auth_user_id);
  if btrim(coalesce(p_display_name, '')) = '' then
    raise exception 'Informe o nome do familiar.' using errcode = '23514';
  end if;

  insert into public.birthday_entries (
    group_client_id, origin, display_name, relationship,
    birth_month, birth_day, consent_status, publish_in_print
  ) values (
    v_client_id, 'familiar', btrim(p_display_name), nullif(btrim(coalesce(p_relationship, '')), ''),
    p_birth_month, p_birth_day,
    case when p_consent then 'granted' else 'pending' end,
    coalesce(p_consent, false)
  )
  returning id into v_id;

  -- Familiar cadastrado invalida a confirmação anterior de "sem
  -- familiares" (mesmo principio de addFamilyMemberAction).
  update public.clients set family_members_confirmed_empty = true where id = v_client_id;

  return v_id;
end;
$$;

revoke all on function public.public_complete_add_family_member(text, uuid, text, text, int, int, boolean) from public, anon, authenticated;
grant execute on function public.public_complete_add_family_member(text, uuid, text, text, int, int, boolean) to service_role;

comment on function public.public_complete_add_family_member(text, uuid, text, text, int, int, boolean) is
  'Adiciona familiar (dia/mês sem ano) pela página pública de complementação cadastral, só com token já verificado. publish_in_print nunca true sem p_consent.';

-- Adicionar pessoa vinculada (PJ) pelo próprio titular, pela página
-- pública — mesma tabela de addRelatedPersonAction, validada contra o
-- token.
create or replace function public.public_complete_add_related_person(
  p_token_sha256 text,
  p_auth_user_id uuid,
  p_full_name text,
  p_role_type text,
  p_phone text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
  v_id uuid;
begin
  v_client_id := public.require_verified_client_completion(p_token_sha256, p_auth_user_id);
  if btrim(coalesce(p_full_name, '')) = '' then
    raise exception 'Informe o nome da pessoa vinculada.' using errcode = '23514';
  end if;
  if p_role_type not in ('responsavel', 'socio', 'colaborador', 'outro') then
    raise exception 'Tipo de vínculo inválido.' using errcode = '23514';
  end if;

  insert into public.client_related_persons (
    client_id, full_name, role_type, phone, email
  ) values (
    v_client_id, btrim(p_full_name), p_role_type,
    nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_email, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.public_complete_add_related_person(text, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.public_complete_add_related_person(text, uuid, text, text, text, text) to service_role;

comment on function public.public_complete_add_related_person(text, uuid, text, text, text, text) is
  'Adiciona pessoa vinculada a um cliente PJ pela página pública de complementação cadastral, só com token já verificado.';

-- Consumo do link — agora com p_finalize: false grava um "autosave"
-- intermediário (status continua verified, o link continua usável);
-- true (padrão, mantém o comportamento já existente para quem já
-- chamava esta função) além de gravar também finaliza o cadastro
-- (status -> completed, uso único). Allow-list ampliada com
-- birth_date/founding_date (nascimento completo do titular PF, ou
-- confirmação da data de fundação da PJ já existente) e
-- family_members_confirmed_empty (confirmação única de "sem
-- familiares"). "titular_consent" é tratado à parte (não é coluna de
-- clients): grava o consentimento de publicação do PRÓPRIO titular na
-- linha birthday_entries origin='cadastro', nunca presumindo
-- autorização quando omitido.
create or replace function public.consume_client_completion_token(
  p_token_sha256 text,
  p_auth_user_id uuid,
  p_updates jsonb,
  p_finalize boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_allowed_keys text[] := array[
    'phone_primary','phone_secondary','whatsapp','email',
    'address_zip','address_street','address_number','address_complement',
    'address_neighborhood','address_city','address_state',
    'birth_date','founding_date','family_members_confirmed_empty'
  ];
  v_key text;
  v_client record;
  v_date date;
  v_display_name text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Somente serviço.' using errcode = '42501';
  end if;
  select id, client_id, status, expires_at, verified_user_id into v_row
    from public.client_completion_tokens
    where token_sha256 = p_token_sha256
    for update;
  if not found or v_row.status <> 'verified' or v_row.expires_at <= now()
     or v_row.verified_user_id is distinct from p_auth_user_id then
    raise exception 'Link indisponível, expirado ou não verificado.' using errcode = '23514';
  end if;

  for v_key in select jsonb_object_keys(coalesce(p_updates, '{}'::jsonb))
  loop
    if not (v_key = any(v_allowed_keys) or v_key = 'titular_consent') then
      raise exception 'Campo não permitido por este link: %', v_key using errcode = '23514';
    end if;
  end loop;

  update public.clients set
    phone_primary = coalesce(p_updates->>'phone_primary', phone_primary),
    phone_secondary = coalesce(p_updates->>'phone_secondary', phone_secondary),
    whatsapp = coalesce(p_updates->>'whatsapp', whatsapp),
    email = coalesce(p_updates->>'email', email),
    address_zip = coalesce(p_updates->>'address_zip', address_zip),
    address_street = coalesce(p_updates->>'address_street', address_street),
    address_number = coalesce(p_updates->>'address_number', address_number),
    address_complement = coalesce(p_updates->>'address_complement', address_complement),
    address_neighborhood = coalesce(p_updates->>'address_neighborhood', address_neighborhood),
    address_city = coalesce(p_updates->>'address_city', address_city),
    address_state = coalesce(p_updates->>'address_state', address_state),
    birth_date = coalesce(nullif(p_updates->>'birth_date', '')::date, birth_date),
    founding_date = coalesce(nullif(p_updates->>'founding_date', '')::date, founding_date),
    family_members_confirmed_empty = coalesce((p_updates->>'family_members_confirmed_empty')::boolean, family_members_confirmed_empty)
  where id = v_row.client_id;

  -- "Titular aproveitado automaticamente na lista de Aniversariantes" —
  -- só cria a linha quando o titular já tem data completa (nunca inventa
  -- data); nunca marca publish_in_print sem titular_consent explícito.
  select id, kind, full_name, company_name, birth_date, founding_date into v_client
    from public.clients where id = v_row.client_id;
  v_date := case when v_client.kind = 'individual' then v_client.birth_date else v_client.founding_date end;
  v_display_name := coalesce(v_client.full_name, v_client.company_name);

  if v_date is not null and v_display_name is not null
     and not exists (
       select 1 from public.birthday_entries
       where origin = 'cadastro' and source_client_id = v_client.id
     ) then
    insert into public.birthday_entries (
      source_client_id, origin, display_name, birth_month, birth_day, birth_year,
      consent_status, publish_in_print
    ) values (
      v_client.id, 'cadastro', v_display_name,
      extract(month from v_date)::smallint, extract(day from v_date)::smallint, extract(year from v_date)::smallint,
      'pending', false
    );
  end if;

  if p_updates ? 'titular_consent' then
    update public.birthday_entries set
      consent_status = case when (p_updates->>'titular_consent')::boolean then 'granted' else 'denied' end,
      consent_recorded_at = now(),
      publish_in_print = (p_updates->>'titular_consent')::boolean
    where origin = 'cadastro' and source_client_id = v_row.client_id;
  end if;

  if p_finalize then
    update public.client_completion_tokens
      set status = 'completed', completed_at = now()
      where id = v_row.id;
  end if;
end;
$$;

revoke all on function public.consume_client_completion_token(text, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.consume_client_completion_token(text, uuid, jsonb, boolean) to service_role;

comment on function public.consume_client_completion_token(text, uuid, jsonb, boolean) is
  'Grava os campos permitidos (allow-list) vindos da página pública de complementação cadastral. p_finalize=false grava autosave intermediário (link continua verified/usável); p_finalize=true (padrão) também conclui o cadastro (status->completed, uso único). titular_consent nunca presumido: só grava publish_in_print=true quando explicitamente informado como true.';
