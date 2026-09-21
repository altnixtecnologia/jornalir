-- Editorias (assuntos) — Parte C do Plano Mestre. Toda matéria pertence
-- sempre a uma. Nunca hardcoded na aplicação: sempre lida desta tabela.

create table public.editorial_sections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.editorial_sections is
  'Editorias/assuntos do jornal (Geral, Esporte, Polícia, ...). sort_order define a ordem de exibição definida pela redação.';

create index editorial_sections_active_sort_idx
  on public.editorial_sections (active, sort_order);

create trigger editorial_sections_set_updated_at
  before update on public.editorial_sections
  for each row
  execute function public.set_updated_at();

alter table public.editorial_sections enable row level security;

-- Leitura: só staff nesta fase (Parte 12 da Fase 17 — leitura pública fica
-- para depois, e nunca inclui conteúdo privado/rascunho; editorias em si
-- não são "privadas", mas o app público ainda não consome este banco).
create policy editorial_sections_select_staff
  on public.editorial_sections for select
  to authenticated
  using (public.is_active_staff());

create policy editorial_sections_insert_staff
  on public.editorial_sections for insert
  to authenticated
  with check (public.is_active_staff());

create policy editorial_sections_update_staff
  on public.editorial_sections for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete: inativar (active = false) é a única forma de
-- remoção — evita quebrar matérias que já referenciam a editoria.
