-- Fase 49, item 2 — "Abrangência" (renomeação só visual de "Localidade")
-- ganha dois novos escopos reais no domínio: `country` e `state`,
-- preservando `general`/`region`/`city` já existentes. Drop + recreate da
-- constraint, mesmo padrão já usado em `articles_origin_check` (Fase 33).
alter table public.localities drop constraint localities_scope_check;
alter table public.localities
  add constraint localities_scope_check
  check (scope in ('general', 'region', 'city', 'state', 'country'));

-- Referências iniciais pedidas pelo usuário — cadastro idempotente
-- (on conflict por slug, nunca duplica se já existir). Preserva Torres,
-- Passo de Torres e São João do Sul já existentes (não tocados aqui).
insert into public.localities (name, slug, scope, sort_order)
values
  ('Brasil', 'brasil', 'country', 10),
  ('Santa Catarina', 'santa-catarina', 'state', 11),
  ('Rio Grande do Sul', 'rio-grande-do-sul', 'state', 12),
  ('Mampituba', 'mampituba', 'city', 13),
  ('Morrinhos do Sul', 'morrinhos-do-sul', 'city', 14),
  ('Praia Grande', 'praia-grande', 'city', 15),
  ('Santa Rosa do Sul', 'santa-rosa-do-sul', 'city', 16)
on conflict (slug) do nothing;
