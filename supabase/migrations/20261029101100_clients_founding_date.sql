-- Data de fundação para instituições (PJ) — pedido explícito do usuário em
-- 17/10/2026 para o módulo Aniversariantes: "destaque com foto, edição
-- manual de mensagens e data de fundação para instituições". Incremental
-- sobre 20261014110000_clients.sql. NÃO aplicada ainda (local apenas).
--
-- DECISÃO: founding_date é um campo NOVO e SEPARADO de birth_date — nunca
-- reaproveita a mesma coluna. birth_date continua exclusivo de pessoa
-- física (clients_identity_by_kind já garante birth_date is null quando
-- kind = 'company', e isso NÃO muda aqui). founding_date é o oposto:
-- só faz sentido para kind = 'company', nunca para pessoa física. As duas
-- colunas nunca se confundem, nem na constraint nem na aplicação — o
-- princípio "PJ nunca tem titular aniversariante" (ver birthday_entries)
-- continua válido: founding_date NÃO cria um "aniversariante" pessoa,
-- cria um aniversário de fundação, conceito próprio exibido separadamente
-- no módulo Aniversariantes (BirthdayGroup.foundingEntry, nunca
-- BirthdayGroup.principal).
alter table public.clients
  add column if not exists founding_date date;

alter table public.clients
  drop constraint if exists clients_founding_date_only_company,
  add constraint clients_founding_date_only_company
    check (founding_date is null or kind = 'company');

comment on column public.clients.founding_date is
  'Data de fundação — só preenchível para kind = company (constraint clients_founding_date_only_company). Usada pelo módulo Aniversariantes para destacar o aniversário de fundação da instituição, sempre como um aniversário de fundação (não confundir com birth_date, que é exclusivo de pessoa física e nunca é preenchido para company).';

-- save_client (criada em 20261014110000_clients.sql, redefinida em
-- 20261025100001_clients_fiscal_fields.sql) precisa escrever founding_date
-- também — sem isto, a RPC ignoraria silenciosamente o valor enviado pela
-- aplicação. Mesma assinatura, mesmo princípio de escrita explícita de toda
-- coluna de identidade a cada chamada.
create or replace function public.save_client(
  p_id uuid,
  p_client jsonb,
  p_roles text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_roles text[] := coalesce(p_roles, '{}'::text[]);
begin
  if auth.role() = 'authenticated' and not public.is_active_staff() then
    raise exception 'save_client: apenas staff ativo pode criar/editar clientes';
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
$$;

comment on function public.save_client(uuid, jsonb, text[]) is
  'Cria (p_id nulo) ou atualiza (p_id preenchido) um cliente e substitui o conjunto de papéis inteiro, tudo na mesma transação. Redefinida em 20261029101100_clients_founding_date.sql para escrever também founding_date — mesma assinatura e mesmo princípio de escrita explícita de toda coluna de identidade das versões anteriores (20261014110000_clients.sql / 20261025100001_clients_fiscal_fields.sql).';
