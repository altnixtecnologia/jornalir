-- Ajuste do painel — listagem de matérias: ordenar por Editoria/Abrangência.
--
-- Testado direto no banco: `order(col, { foreignTable })` do PostgREST NÃO
-- ordena as linhas de `articles` pelo nome da editoria/localidade embutida
-- (many-to-one) — só reordena linhas de um embed one-to-many aninhado. Sem
-- isso, "ordenar por Editoria" simplesmente não fazia nada.
--
-- Fix: colunas cache `section_name`/`locality_name` em `articles`, mantidas
-- em sincronia por trigger (nunca confiáveis a partir do payload do
-- cliente — sempre recalculadas a partir de `section_id`/`locality_id`).
-- Editorias/localidades são poucas e raríssimo mudarem de nome, então o
-- custo de propagar um rename é irrelevante; o ganho é poder ordenar/indexar
-- direto numa coluna simples em vez de um join.
alter table public.articles add column section_name text;
alter table public.articles add column locality_name text;

update public.articles a
  set section_name = s.name
  from public.editorial_sections s
  where s.id = a.section_id;

update public.articles a
  set locality_name = l.name
  from public.localities l
  where l.id = a.locality_id;

alter table public.articles alter column section_name set not null;
alter table public.articles alter column locality_name set not null;

create index articles_section_name_idx on public.articles (section_name, id desc);
create index articles_locality_name_idx on public.articles (locality_name, id desc);

create or replace function public.sync_article_section_locality_names()
returns trigger
language plpgsql
as $$
begin
  select name into new.section_name from public.editorial_sections where id = new.section_id;
  select name into new.locality_name from public.localities where id = new.locality_id;
  return new;
end;
$$;

create trigger articles_sync_section_locality_names
  before insert or update of section_id, locality_id on public.articles
  for each row execute function public.sync_article_section_locality_names();

comment on function public.sync_article_section_locality_names is
  'Ajuste pós-Fase 49: mantém articles.section_name/locality_name em sincronia com section_id/locality_id — sempre derivado, nunca aceito do payload do cliente.';

-- Propaga rename de editoria/localidade (raro) para as matérias já gravadas.
create or replace function public.propagate_section_name_change()
returns trigger
language plpgsql
as $$
begin
  if new.name is distinct from old.name then
    update public.articles set section_name = new.name where section_id = new.id;
  end if;
  return new;
end;
$$;

create trigger editorial_sections_propagate_name
  after update of name on public.editorial_sections
  for each row execute function public.propagate_section_name_change();

create or replace function public.propagate_locality_name_change()
returns trigger
language plpgsql
as $$
begin
  if new.name is distinct from old.name then
    update public.articles set locality_name = new.name where locality_id = new.id;
  end if;
  return new;
end;
$$;

create trigger localities_propagate_name
  after update of name on public.localities
  for each row execute function public.propagate_locality_name_change();
