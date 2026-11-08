-- Salvamento direto dos rascunhos da captura visual (pedido do usuário,
-- 07/11/2026). Nova tabela só de METADADO de coordenada/texto por região —
-- a matéria de verdade continua inteiramente em `public.articles`; nenhuma
-- das 28 matérias já recuperadas pelo ChatGPT (edição 776, origin='pdf',
-- status='draft') é tocada por esta migration. `on delete cascade` é
-- seguro aqui porque `articles` nunca tem exclusão destrutiva (sem policy
-- de delete, ver 20260921100500_articles.sql) — o cascade só poderia
-- disparar se alguém excluísse a matéria por outro caminho, o que hoje
-- nunca acontece.

create table public.pdf_capture_regions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,
  page integer not null check (page > 0),
  rect_x numeric(6,5) not null check (rect_x >= 0 and rect_x <= 1),
  rect_y numeric(6,5) not null check (rect_y >= 0 and rect_y <= 1),
  rect_width numeric(6,5) not null check (rect_width > 0 and rect_width <= 1),
  rect_height numeric(6,5) not null check (rect_height > 0 and rect_height <= 1),
  sort_order integer not null check (sort_order >= 0),
  extracted_title text,
  extracted_subtitle text,
  extracted_body text,
  needs_review boolean not null default false,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (article_id, sort_order)
);

comment on table public.pdf_capture_regions is
  'Uma linha por retângulo desenhado na captura visual de matérias (Editorial → Edições → Detalhes). sort_order é a ordem das áreas dentro da matéria (mesma ordem usada por combineAreaExtractions no cliente). extracted_* guarda o texto reconhecido SÓ daquela área isolada — permite recompor o corpo ao remover uma área sem reabrir/reprocessar o PDF.';
comment on column public.pdf_capture_regions.rect_x is
  'Retângulo normalizado 0..1 da página (mesmo contrato de NormalizedRect no cliente) — imune a zoom/resolução.';

create index pdf_capture_regions_article_id_idx on public.pdf_capture_regions (article_id);

create trigger pdf_capture_regions_set_updated_at
  before update on public.pdf_capture_regions
  for each row
  execute function public.set_updated_at();

alter table public.pdf_capture_regions enable row level security;

-- Espelha exatamente a policy de public.articles (mesmo helper de staff
-- ativo). Delete é necessário aqui (diferente de articles) porque remover
-- UMA área é apagar só a linha da região, nunca a matéria — a exclusão
-- "destrutiva" continua proibida em articles.
create policy pdf_capture_regions_select_staff
  on public.pdf_capture_regions for select
  to authenticated
  using (public.is_active_staff());

create policy pdf_capture_regions_insert_staff
  on public.pdf_capture_regions for insert
  to authenticated
  with check (public.is_active_staff());

create policy pdf_capture_regions_update_staff
  on public.pdf_capture_regions for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create policy pdf_capture_regions_delete_staff
  on public.pdf_capture_regions for delete
  to authenticated
  using (public.is_active_staff());

-- Chave de idempotência de criação: o crypto.randomUUID() que o cliente já
-- gera ao desenhar uma seleção nova passa a ser enviado ao servidor e
-- guardado aqui. NULL é permitido e múltiplo no Postgres (UNIQUE não
-- bloqueia vários NULLs) — nenhuma das 28 matérias existentes, nem
-- nenhuma matéria normal (origin='manual'), é afetada.
alter table public.articles add column pdf_capture_client_id uuid unique;

comment on column public.articles.pdf_capture_client_id is
  'Id gerado no navegador (crypto.randomUUID()) no momento em que o operador desenha a primeira seleção da matéria, na captura visual. Usado por save_pdf_capture_draft() para nunca criar duas matérias para a mesma seleção em caso de retry de rede. NULL para toda matéria que não vem desse fluxo (a imensa maioria).';
