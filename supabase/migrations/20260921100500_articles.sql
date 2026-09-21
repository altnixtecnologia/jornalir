-- Matérias (Partes C, E e G do Plano Mestre). Nunca exclusão destrutiva —
-- "arquivada" é o único caminho de remoção (sem policy de delete abaixo).

create sequence public.articles_reference_seq;

-- IR-MAT-2026-000001 — mesmo formato conceitual do Plano Mestre (Parte 11),
-- sequencial por instância do banco (não reinicia por ano; simples e
-- suficiente para o volume de um jornal regional).
create or replace function public.generate_article_reference()
returns text
language sql
as $$
  select 'IR-MAT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.articles_reference_seq')::text, 6, '0');
$$;

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  internal_reference text not null unique default public.generate_article_reference(),
  slug text not null unique,
  title text not null,
  subtitle text,
  body text not null default '',
  section_id uuid not null references public.editorial_sections (id),
  locality_id uuid not null references public.localities (id),
  status text not null default 'draft'
    check (status in ('draft', 'adjusting', 'scheduled', 'published', 'archived')),
  notification_mode text not null default 'none'
    check (notification_mode in ('none', 'normal', 'urgent')),
  origin text not null default 'manual'
    check (origin in ('manual', 'pdf')),
  newspaper_edition_id uuid references public.newspaper_editions (id),
  newspaper_page integer,
  scheduled_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.articles is
  'Matéria real. Nunca publicada automaticamente (origin=pdf sempre nasce status=draft — aplicado pela aplicação, reforçado depois por trigger/policy se necessário). Sem exclusão destrutiva.';
comment on column public.articles.newspaper_page is
  'Página da edição impressa de origem — corrigível manualmente mesmo após a importação.';

create index articles_section_id_idx on public.articles (section_id);
create index articles_locality_id_idx on public.articles (locality_id);
create index articles_status_idx on public.articles (status);
create index articles_newspaper_edition_id_idx on public.articles (newspaper_edition_id);
create index articles_updated_at_idx on public.articles (updated_at desc);

create trigger articles_set_updated_at
  before update on public.articles
  for each row
  execute function public.set_updated_at();

alter table public.articles enable row level security;

create policy articles_select_staff
  on public.articles for select
  to authenticated
  using (public.is_active_staff());

create policy articles_insert_staff
  on public.articles for insert
  to authenticated
  with check (public.is_active_staff());

create policy articles_update_staff
  on public.articles for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete — "arquivada" é a única remoção (Plano Mestre, Parte P).
