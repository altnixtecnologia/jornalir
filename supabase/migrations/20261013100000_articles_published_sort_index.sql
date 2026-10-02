-- Causa raiz do erro "Server Components render" ao abrir matérias no
-- portal público: `listPublicArticles`/`listPublicArticlesPage` (usadas
-- por "Leia também", home e listagens) ordenam por `published_at desc,
-- id desc` sobre as matérias `published`. Até a Fase 46 esse recorte era
-- pequeno; com a carga histórica completa (Fase 46C, ~23 mil matérias
-- published), virou um sort completo sem índice de apoio — intermitente
-- o bastante para estourar o statement_timeout do Postgres em qualquer
-- página de matéria (a consulta secundária "Leia também" roda em toda
-- abertura, não só na home/"Mais destaques").
create index articles_published_sort_idx
  on public.articles (published_at desc, id desc)
  where status = 'published';

comment on index public.articles_published_sort_idx is
  'Suporta a ordenação published_at desc/id desc usada por toda listagem pública (home, /noticias, "Leia também") — sem ele, sort completo sobre todas as matérias published (Fase 46C: ~23k linhas) estourava statement_timeout de forma intermitente.';
