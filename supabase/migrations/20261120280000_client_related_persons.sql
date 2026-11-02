-- Bloco B — Cadastro complementar (02/11/2026): "pessoas vinculadas" a
-- um cliente PJ (responsável, sócio, colaborador) — sem criar outro CRM
-- genérico e sem duplicar CPF/CNPJ (a identidade continua só em
-- public.clients). Deliberadamente SEPARADA de public.birthday_entries:
-- esta tabela não é sobre aniversário/editorial, é sobre "quem responde
-- por esta empresa" — por isso não exige dia/mês de nascimento.
create table public.client_related_persons (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,

  full_name text not null,
  role_type text not null check (role_type in ('responsavel', 'socio', 'colaborador', 'outro')),
  cpf text,
  phone text,
  email text,
  birth_month smallint,
  birth_day smallint,
  notes text,

  active boolean not null default true,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint client_related_persons_full_name_length check (char_length(btrim(full_name)) between 2 and 180),
  constraint client_related_persons_cpf_digits check (cpf is null or cpf ~ '^[0-9]{11}$'),
  constraint client_related_persons_email_format check (email is null or email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  constraint client_related_persons_birth_month_range check (birth_month is null or birth_month between 1 and 12),
  constraint client_related_persons_birth_day_range check (birth_day is null or birth_day between 1 and 31),
  constraint client_related_persons_birth_pair check (
    (birth_month is null and birth_day is null) or (birth_month is not null and birth_day is not null)
  )
);

comment on table public.client_related_persons is
  'Pessoas vinculadas a um cliente PJ (responsável/sócio/colaborador) — satélite de public.clients, nunca duplica CPF/CNPJ da empresa nem substitui public.birthday_entries (aniversariantes/editorial).';
comment on column public.client_related_persons.client_id is
  'Cliente PJ ao qual esta pessoa está vinculada. Pode também ser PF em casos excepcionais (ex.: procurador), mas o uso típico é empresa.';
comment on column public.client_related_persons.role_type is
  'responsavel | socio | colaborador | outro — texto livre fica em notes.';

create index client_related_persons_client_id_idx on public.client_related_persons (client_id);
create index client_related_persons_active_idx on public.client_related_persons (client_id, active);

create trigger client_related_persons_set_updated_at
  before update on public.client_related_persons
  for each row
  execute function public.set_updated_at();

create or replace function public.set_client_related_person_actor()
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

create trigger client_related_persons_set_actor
  before insert on public.client_related_persons
  for each row
  execute function public.set_client_related_person_actor();

alter table public.client_related_persons enable row level security;

-- Mesmo padrão de permissão de Cadastros (is_active_staff()) — nenhuma
-- policy nova inventada.
create policy client_related_persons_select_staff
  on public.client_related_persons for select
  to authenticated
  using (public.is_active_staff());

create policy client_related_persons_insert_staff
  on public.client_related_persons for insert
  to authenticated
  with check (public.is_active_staff());

create policy client_related_persons_update_staff
  on public.client_related_persons for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete — remoção é sempre active = false (soft delete),
-- mesmo princípio de birthday_entries/clients.
