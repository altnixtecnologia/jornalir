-- Incremental, idempotent fix (24/11/2026).
-- MIGRATION 20261120310000 IS ALREADY APPLIED. Do not edit/re-run its historical definition.
-- Preserve verified OTP/token, role grants, birthday consent, and all other behavior.
-- A new active family member must invalidate the prior "no family" confirmation.
-- Also prevent an autosave/finalization from reinstating the flag in a record
-- that already has active family members (including old inconsistent records).
-- Neither routine authorizes publishing any birthday without consent.
begin;

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
  update public.clients set family_members_confirmed_empty = false where id = v_client_id;

  return v_id;
end;
$$;

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
    family_members_confirmed_empty = case
      when exists (
        select 1 from public.birthday_entries b
        where b.group_client_id = v_row.client_id
          and b.origin = 'familiar' and b.active
      ) then false
      else coalesce((p_updates->>'family_members_confirmed_empty')::boolean, family_members_confirmed_empty)
    end
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

revoke all on function public.public_complete_add_family_member(text, uuid, text, text, int, int, boolean)
  from public, anon, authenticated;
grant execute on function public.public_complete_add_family_member(text, uuid, text, text, int, int, boolean)
  to service_role;
revoke all on function public.consume_client_completion_token(text, uuid, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.consume_client_completion_token(text, uuid, jsonb, boolean)
  to service_role;

comment on function public.public_complete_add_family_member(text, uuid, text, text, int, int, boolean) is
  'Adiciona familiar apenas para token e canal verificados. Incluindo familiar, limpa a confirmação antiga de que não há familiares; publicação somente com consentimento explícito.';
commit;
