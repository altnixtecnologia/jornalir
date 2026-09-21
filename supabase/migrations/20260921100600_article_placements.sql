-- Destaques/capa (Parte F do Plano Mestre) — exposição editorial temporária
-- e rotativa, NUNCA a editoria da matéria. Tabela separada (não uma coluna
-- em articles) porque o histórico de destaques de uma matéria é relevante
-- por si só (uma matéria pode passar por vários destaques ao longo do tempo).

create table public.article_placements (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,
  type text not null
    check (type in ('headline', 'primary', 'secondary', 'breaking', 'section', 'special')),
  starts_at timestamptz,
  ends_at timestamptz,
  priority integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint article_placements_window_check
    check (starts_at is null or ends_at is null or starts_at < ends_at)
);

comment on table public.article_placements is
  'Exposição editorial temporária (capa/manchete/etc). A matéria continua existindo em sua editoria mesmo sem nenhum placement ativo.';

create index article_placements_article_id_idx on public.article_placements (article_id);
create index article_placements_active_type_idx
  on public.article_placements (active, type, priority);

create trigger article_placements_set_updated_at
  before update on public.article_placements
  for each row
  execute function public.set_updated_at();

alter table public.article_placements enable row level security;

create policy article_placements_select_staff
  on public.article_placements for select
  to authenticated
  using (public.is_active_staff());

create policy article_placements_insert_staff
  on public.article_placements for insert
  to authenticated
  with check (public.is_active_staff());

create policy article_placements_update_staff
  on public.article_placements for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete: encerrar um destaque é active=false / ends_at no passado.
