-- Edições do jornal impresso (Parte G/H do Plano Mestre). Uma matéria pode
-- apontar para uma edição + página de origem (importada de PDF ou, mais
-- raramente, vinculada manualmente).

create table public.newspaper_editions (
  id uuid primary key default gen_random_uuid(),
  edition_number integer not null unique,
  publication_date date not null,
  title text,
  pdf_url text,
  cover_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.newspaper_editions is
  'Uma linha por edição impressa. pdf_url alimenta futuramente "Ver esta matéria na edição digital" no portal — nunca inventado enquanto vazio.';

create index newspaper_editions_publication_date_idx
  on public.newspaper_editions (publication_date desc);

create trigger newspaper_editions_set_updated_at
  before update on public.newspaper_editions
  for each row
  execute function public.set_updated_at();

alter table public.newspaper_editions enable row level security;

create policy newspaper_editions_select_staff
  on public.newspaper_editions for select
  to authenticated
  using (public.is_active_staff());

create policy newspaper_editions_insert_staff
  on public.newspaper_editions for insert
  to authenticated
  with check (public.is_active_staff());

create policy newspaper_editions_update_staff
  on public.newspaper_editions for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());
