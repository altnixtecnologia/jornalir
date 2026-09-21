-- Seeds mínimos de dados de referência (não fictícios excessivos): as 7
-- editorias já validadas desde a Fase 12 e as localidades reais da área de
-- cobertura do jornal já usadas em todo o mock do projeto. Idempotente
-- (on conflict do nothing) para aplicar sem erro em qualquer ordem de
-- execução repetida (`supabase db reset`).

insert into public.editorial_sections (name, slug, sort_order) values
  ('Geral', 'geral', 0),
  ('Esporte', 'esporte', 1),
  ('Polícia', 'policia', 2),
  ('Política', 'politica', 3),
  ('Economia', 'economia', 4),
  ('Eventos', 'eventos', 5),
  ('Cidades', 'cidades', 6)
on conflict (slug) do nothing;

insert into public.localities (name, slug, scope, sort_order) values
  ('Geral', 'geral', 'general', 0),
  ('Torres', 'torres', 'city', 1),
  ('Passo de Torres', 'passo-de-torres', 'city', 2),
  ('São João do Sul', 'sao-joao-do-sul', 'city', 3)
on conflict (slug) do nothing;
