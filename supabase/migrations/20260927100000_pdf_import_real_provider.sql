-- Fase 27 — banco pronto para o provider real de Importação de PDF.
-- Incremental — não altera nenhuma migration anterior.
--
-- `ImportCandidateSourcePreview.tsx` usa `extraction.pageWidth`/`pageHeight`
-- de verdade (viewBox do SVG de pré-visualização da página de origem) — sem
-- coluna, o provider real descartaria esse dado silenciosamente assim que
-- existisse. Corrigido junto com o provider, não antes (mesmo princípio das
-- Fases 25/26: só muda schema quando há uso real e imediato).
alter table public.pdf_import_candidates
  add column page_width numeric,
  add column page_height numeric;

comment on column public.pdf_import_candidates.page_width is
  'Largura da página de origem (unidade do PDF) — usado no viewBox da pré-visualização.';
comment on column public.pdf_import_candidates.page_height is
  'Altura da página de origem — mesmo uso de page_width.';
