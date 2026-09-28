-- Ajuste do painel — listagem de matérias (ordenação/datas/toolbar).
--
-- A listagem administrativa ordenava por `updated_at DESC`, misturando
-- matérias antigas recém-editadas com conteúdo realmente recente. A data
-- editorial correta depende do status: publicada usa `published_at`,
-- programada usa `scheduled_at`, rascunho/ajuste sem nenhuma das duas usa
-- `updated_at` só como fallback administrativo. `coalesce` nessa ordem já
-- resolve os três casos corretamente sem precisar de lógica condicional por
-- status: uma matéria publicada nunca tem `scheduled_at` (foi publicada, não
-- está mais agendada), então cai direto em `published_at`.
alter table public.articles
  add column editorial_sort_at timestamptz
  generated always as (coalesce(scheduled_at, published_at, updated_at)) stored;

comment on column public.articles.editorial_sort_at is
  'Data editorial derivada (Ajuste pós-Fase 49): coalesce(scheduled_at, published_at, updated_at). Usada como ordenação padrão da listagem administrativa — nunca updated_at puro.';

create index articles_editorial_sort_at_idx on public.articles (editorial_sort_at desc, id desc);
