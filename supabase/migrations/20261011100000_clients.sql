-- Módulo Clientes (Fase 1) — cadastro central único de pessoas e empresas.
-- Guarda só identidade e contato: nenhum campo específico de assinatura,
-- financeiro ou publicidade entra aqui (esses módulos futuros vão referenciar
-- client_id em tabelas próprias, nunca ganhar colunas nesta). Papéis
-- (cliente/assinante/anunciante/parceiro/fornecedor) ficam numa tabela
-- auxiliar separada porque um mesmo cadastro pode acumular mais de um papel
-- ao longo do tempo, e módulos futuros precisam poder consultar isso sem
-- depender de uma coluna array/jsonb (mais fácil de indexar/filtrar como
-- linhas).

create sequence public.clients_reference_seq;

create or replace function public.generate_client_reference()
returns text
language sql
as $$
  select 'IR-CLI-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.clients_reference_seq')::text, 6, '0');
$$;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  internal_reference text not null unique default public.generate_client_reference(),

  kind text not null check (kind in ('individual', 'company')),
  status text not null default 'active' check (status in ('active', 'inactive')),

  -- Pessoa física
  full_name text,
  cpf text,
  birth_date date,

  -- Pessoa jurídica
  company_name text,
  trade_name text,
  cnpj text,
  state_registration text,
  responsible_name text,
  responsible_cpf text,

  -- Contato — comum aos dois tipos
  phone_primary text,
  phone_secondary text,
  whatsapp text,
  email text,

  -- Endereço — sem consulta automática de CEP nesta fase, só os campos
  address_zip text,
  address_street text,
  address_number text,
  address_complement text,
  address_neighborhood text,
  address_city text,
  address_state text,

  notes text,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Identidade coerente com o tipo: pessoa física nunca tem razão social/
  -- CNPJ, pessoa jurídica nunca tem CPF próprio no campo de pessoa física
  -- (o CPF do responsável, quando houver, vai em responsible_cpf, campo
  -- separado — nunca confundido com o CPF de um cadastro individual).
  constraint clients_identity_by_kind check (
    (kind = 'individual' and full_name is not null and company_name is null and trade_name is null and cnpj is null)
    or
    (kind = 'company' and company_name is not null and full_name is null and cpf is null and birth_date is null)
  ),

  -- CPF/CNPJ sempre normalizados (só dígitos) antes de chegar aqui — a
  -- aplicação normaliza, o banco só confere o formato como segunda linha
  -- de defesa (nunca confia só na camada de aplicação pra integridade).
  constraint clients_cpf_digits check (cpf is null or cpf ~ '^[0-9]{11}$'),
  constraint clients_cnpj_digits check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  constraint clients_responsible_cpf_digits check (responsible_cpf is null or responsible_cpf ~ '^[0-9]{11}$')
);

comment on table public.clients is
  'Cadastro central único de pessoas e empresas (Fase 1 do módulo Clientes). Só identidade e contato — assinaturas/financeiro/publicidade são módulos futuros que referenciam client_id em tabelas próprias.';
comment on column public.clients.kind is
  'individual (pessoa física) ou company (pessoa jurídica) — define quais campos de identidade são obrigatórios (ver clients_identity_by_kind).';
comment on column public.clients.status is
  'active/inactive — nunca apagar um cliente por ficar inativo, só trocar o status.';

-- CPF e CNPJ válidos não podem existir duplicados (índice único parcial —
-- só se aplica a valores não nulos, então vários clientes sem CPF/CNPJ
-- cadastrado convivem sem conflito). Telefone/e-mail NUNCA bloqueiam
-- cadastro — podem coincidir legitimamente (família, mesma empresa).
create unique index clients_cpf_unique on public.clients (cpf) where cpf is not null;
create unique index clients_cnpj_unique on public.clients (cnpj) where cnpj is not null;

create index clients_status_idx on public.clients (status);
create index clients_kind_idx on public.clients (kind);
create index clients_created_at_idx on public.clients (created_at desc);
create index clients_email_idx on public.clients (email) where email is not null;
create index clients_phone_primary_idx on public.clients (phone_primary) where phone_primary is not null;
create index clients_whatsapp_idx on public.clients (whatsapp) where whatsapp is not null;

create trigger clients_set_updated_at
  before update on public.clients
  for each row
  execute function public.set_updated_at();

create or replace function public.set_client_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

comment on function public.set_client_actor() is
  'created_by sempre auth.uid() da sessão autenticada — ignora qualquer valor vindo do cliente, mesmo princípio de set_media_asset_actor().';

create trigger clients_set_actor
  before insert on public.clients
  for each row
  execute function public.set_client_actor();

alter table public.clients enable row level security;

create policy clients_select_staff
  on public.clients for select
  to authenticated
  using (public.is_active_staff());

create policy clients_insert_staff
  on public.clients for insert
  to authenticated
  with check (public.is_active_staff());

create policy clients_update_staff
  on public.clients for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete — mesmo princípio das demais tabelas: inativar é a
-- única remoção oferecida (requisito explícito: nunca apagar cliente).

-- Papéis/vínculos do cliente (item 3 da Fase 1) — tabela auxiliar em vez de
-- coluna array/jsonb: cada papel é uma linha própria, fácil de indexar e de
-- consultar por módulos futuros ("me dê todos os assinantes") sem precisar
-- de operador de array. Nesta fase só armazena o vínculo — nenhuma
-- funcionalidade específica de cada papel é implementada ainda.
create table public.client_roles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  role text not null check (role in ('cliente', 'assinante', 'anunciante', 'parceiro', 'fornecedor')),
  created_at timestamptz not null default now(),
  constraint client_roles_unique_per_client unique (client_id, role)
);

comment on table public.client_roles is
  'Papéis que um cliente pode acumular (cliente/assinante/anunciante/parceiro/fornecedor). Um client_id pode ter várias linhas. Módulos futuros (assinaturas, publicidade) consultam esta tabela, nunca duplicam o conceito de papel em outro lugar.';

create index client_roles_client_id_idx on public.client_roles (client_id);
create index client_roles_role_idx on public.client_roles (role);

alter table public.client_roles enable row level security;

create policy client_roles_select_staff
  on public.client_roles for select
  to authenticated
  using (public.is_active_staff());

create policy client_roles_insert_staff
  on public.client_roles for insert
  to authenticated
  with check (public.is_active_staff());

create policy client_roles_update_staff
  on public.client_roles for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create policy client_roles_delete_staff
  on public.client_roles for delete
  to authenticated
  using (public.is_active_staff());

comment on index public.clients_cpf_unique is
  'CPF válido nunca pode existir duplicado no cadastro central (requisito explícito de proteção contra duplicidade).';
comment on index public.clients_cnpj_unique is
  'CNPJ válido nunca pode existir duplicado no cadastro central (requisito explícito de proteção contra duplicidade).';

-- Gravação atômica cliente+papéis (create OU update) na mesma transação
-- implícita da chamada RPC — mesmo princípio de legacy_import_article().
-- Resolve dois problemas do provider anterior (que fazia UPDATE parcial +
-- DELETE/INSERT de papéis como operações HTTP separadas):
--   1) troca de kind (individual <-> company) deixando campo órfão do tipo
--      anterior no banco (ex.: full_name sobrevivendo numa linha que virou
--      company) — aqui TODO campo de identidade é escrito explicitamente a
--      cada chamada, nunca "pulado" por estar undefined no client, então o
--      campo do tipo anterior é sempre limpo pra null.
--   2) se o INSERT dos novos papéis falhasse depois do DELETE dos antigos,
--      o cliente ficava sem papel nenhum — aqui tudo é uma função só:
--      qualquer exceção (inclusive violação de clients_cpf_unique/
--      clients_cnpj_unique/clients_identity_by_kind) desfaz TUDO, incluindo
--      o DELETE dos papéis antigos.
-- security definer pelo mesmo motivo de legacy_import_article: a checagem
-- de staff é feita explicitamente no corpo da função. RLS continua valendo
-- pra qualquer outro acesso às duas tabelas (select direto, por exemplo).
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
      company_name, trade_name, cnpj, state_registration, responsible_name, responsible_cpf,
      phone_primary, phone_secondary, whatsapp, email,
      address_zip, address_street, address_number, address_complement, address_neighborhood, address_city, address_state,
      notes
    )
    values (
      p_client->>'kind', coalesce(p_client->>'status', 'active'),
      p_client->>'full_name', p_client->>'cpf', nullif(p_client->>'birth_date', '')::date,
      p_client->>'company_name', p_client->>'trade_name', p_client->>'cnpj', p_client->>'state_registration', p_client->>'responsible_name', p_client->>'responsible_cpf',
      p_client->>'phone_primary', p_client->>'phone_secondary', p_client->>'whatsapp', p_client->>'email',
      p_client->>'address_zip', p_client->>'address_street', p_client->>'address_number', p_client->>'address_complement', p_client->>'address_neighborhood', p_client->>'address_city', p_client->>'address_state',
      p_client->>'notes'
    )
    returning id into v_id;
  else
    -- Toda coluna de identidade é escrita explicitamente (nunca "coalesce
    -- com o valor atual") — é exatamente isso que garante a limpeza do
    -- campo do tipo anterior numa troca de kind.
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
      phone_primary = p_client->>'phone_primary',
      phone_secondary = p_client->>'phone_secondary',
      whatsapp = p_client->>'whatsapp',
      email = p_client->>'email',
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
  'Cria (p_id nulo) ou atualiza (p_id preenchido) um cliente e substitui o conjunto de papéis inteiro, tudo na mesma transação. Toda coluna de identidade é sempre escrita (nunca condicional), garantindo que uma troca individual<->company limpe os campos do tipo anterior. Qualquer falha (CPF/CNPJ duplicado, constraint de identidade, erro nos papéis) desfaz a operação inteira — nunca deixa cliente sem papel nem campo órfão do tipo anterior.';

revoke all on function public.save_client(uuid, jsonb, text[]) from public;
grant execute on function public.save_client(uuid, jsonb, text[]) to authenticated, service_role;
