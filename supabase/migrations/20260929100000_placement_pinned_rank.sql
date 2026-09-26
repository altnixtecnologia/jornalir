-- Fase 29 — gestão central de destaques. Incremental — não altera
-- nenhuma migration anterior.
--
-- Ordem manual entre fixadas (item 1/3 da fase — "permitir reorganizar
-- manualmente quando fizer sentido"): só faz sentido para fixadas
-- (`pinned=true`), porque as não fixadas já giram sozinhas por recência
-- (`created_at`/rotação automática) — reordenar manualmente uma não
-- fixada entraria em conflito direto com a rotação. `pinned_rank` nulo
-- para não fixadas; entre fixadas, menor primeiro.
alter table public.article_placements
  add column pinned_rank integer;

comment on column public.article_placements.pinned_rank is
  'Ordem manual entre matérias fixadas (pinned=true) na mesma posição — menor primeiro. Nulo/ignorado para não fixadas, que continuam ordenadas por recência.';
