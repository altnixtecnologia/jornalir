-- Localidades (cidade/região/geral) — Parte C do Plano Mestre, sempre
-- independente da editoria. parent_id permite futuramente agrupar uma
-- cidade sob uma região (opcional; não usado pelos seeds iniciais).

create table public.localities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  scope text not null check (scope in ('general', 'region', 'city')),
  parent_id uuid references public.localities (id) on delete set null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.localities is
  'Cidade/região/abrangência geral. Independente da editoria (Polícia + Passo de Torres, Geral + Região, etc.).';
comment on column public.localities.parent_id is
  'Cidade pode apontar para a região a que pertence. Opcional — nenhum seed inicial usa isso ainda.';

create index localities_active_sort_idx
  on public.localities (active, sort_order);
create index localities_parent_id_idx
  on public.localities (parent_id);

create trigger localities_set_updated_at
  before update on public.localities
  for each row
  execute function public.set_updated_at();

alter table public.localities enable row level security;

create policy localities_select_staff
  on public.localities for select
  to authenticated
  using (public.is_active_staff());

create policy localities_insert_staff
  on public.localities for insert
  to authenticated
  with check (public.is_active_staff());

create policy localities_update_staff
  on public.localities for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete — mesmo princípio de editorial_sections.
