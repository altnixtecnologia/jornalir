-- Corrige a RPC privilegiada que seria bypass das novas políticas de Clientes.
-- Mantém a lógica de gravação e papéis integralmente, alterando somente
-- a validação da identidade e das ações; código original recuperado do banco.
CREATE OR REPLACE FUNCTION public.save_client(p_id uuid, p_client jsonb, p_roles text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_roles text[] := coalesce(p_roles, '{}'::text[]);
begin
  -- Chamadas diretas à função SECURITY DEFINER precisam conferir a ação
  -- específica; RLS de clients não cobre alterações feitas pelo owner da RPC.
  if auth.role() is distinct from 'service_role' then
    if (select auth.uid()) is null or
       not public.staff_can_module_action(
         'clientes', case when p_id is null then 'clientes_criar' else 'clientes_editar' end
       ) then
      raise exception 'save_client: sem permissão de cadastro/edição'
        using errcode = '42501';
    end if;
  end if;

  if p_id is null then
    insert into public.clients (
      kind, status,
      full_name, cpf, birth_date,
      company_name, trade_name, cnpj, state_registration, responsible_name, responsible_cpf, founding_date,
      phone_primary, phone_secondary, whatsapp, email, fiscal_email,
      municipal_registration, address_ibge_code, icms_status,
      address_zip, address_street, address_number, address_complement, address_neighborhood, address_city, address_state,
      notes
    )
    values (
      p_client->>'kind', coalesce(p_client->>'status', 'active'),
      p_client->>'full_name', p_client->>'cpf', nullif(p_client->>'birth_date', '')::date,
      p_client->>'company_name', p_client->>'trade_name', p_client->>'cnpj', p_client->>'state_registration', p_client->>'responsible_name', p_client->>'responsible_cpf', nullif(p_client->>'founding_date', '')::date,
      p_client->>'phone_primary', p_client->>'phone_secondary', p_client->>'whatsapp', p_client->>'email', p_client->>'fiscal_email',
      p_client->>'municipal_registration', p_client->>'address_ibge_code', p_client->>'icms_status',
      p_client->>'address_zip', p_client->>'address_street', p_client->>'address_number', p_client->>'address_complement', p_client->>'address_neighborhood', p_client->>'address_city', p_client->>'address_state',
      p_client->>'notes'
    )
    returning id into v_id;
  else
    update public.clients set
      kind = p_client->>'kind',
      status = coalesce(p_client->>'status', 'active'),
      full_name = p_client->>'full_name',
      cpf = p_client->>'cpf',
      birth_date = nullif(p_client->>'birth_date', '')::date,
      company_name = p_client->>'company_name',
      trade_name = p_client->>'trade_name',
      cnpj = p_client->>'cnpj',
      state_registration = p_client->>'state_registration',
      responsible_name = p_client->>'responsible_name',
      responsible_cpf = p_client->>'responsible_cpf',
      founding_date = nullif(p_client->>'founding_date', '')::date,
      phone_primary = p_client->>'phone_primary',
      phone_secondary = p_client->>'phone_secondary',
      whatsapp = p_client->>'whatsapp',
      email = p_client->>'email',
      fiscal_email = p_client->>'fiscal_email',
      municipal_registration = p_client->>'municipal_registration',
      address_ibge_code = p_client->>'address_ibge_code',
      icms_status = p_client->>'icms_status',
      address_zip = p_client->>'address_zip',
      address_street = p_client->>'address_street',
      address_number = p_client->>'address_number',
      address_complement = p_client->>'address_complement',
      address_neighborhood = p_client->>'address_neighborhood',
      address_city = p_client->>'address_city',
      address_state = p_client->>'address_state',
      notes = p_client->>'notes'
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'save_client: cliente não encontrado (id=%)', p_id;
    end if;
  end if;

  delete from public.client_roles where client_id = v_id;
  if array_length(v_roles, 1) > 0 then
    insert into public.client_roles (client_id, role)
    select v_id, r from unnest(v_roles) as r;
  end if;

  return v_id;
end;
$function$;

revoke all on function public.save_client(uuid,jsonb,text[]) from public,anon;
grant execute on function public.save_client(uuid,jsonb,text[]) to authenticated,service_role;
