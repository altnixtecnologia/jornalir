-- Ordenação indexada por edição para a lista original de Matérias.
alter table public.articles add column if not exists edition_sort_number integer;
update public.articles a set edition_sort_number = e.edition_number
from public.newspaper_editions e
where a.newspaper_edition_id = e.id
  and a.edition_sort_number is distinct from e.edition_number;

create or replace function public.sync_article_edition_sort_number()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.newspaper_edition_id is null then
    new.edition_sort_number := null;
  else
    select e.edition_number into new.edition_sort_number
    from public.newspaper_editions e where e.id = new.newspaper_edition_id;
  end if;
  return new;
end;
$$;
drop trigger if exists tr_sync_article_edition_sort_number on public.articles;
create trigger tr_sync_article_edition_sort_number
before insert or update of newspaper_edition_id on public.articles
for each row execute function public.sync_article_edition_sort_number();

create or replace function public.sync_articles_on_edition_number_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.edition_number is distinct from old.edition_number then
    update public.articles
    set edition_sort_number = new.edition_number
    where newspaper_edition_id = new.id
      and edition_sort_number is distinct from new.edition_number;
  end if;
  return new;
end;
$$;
drop trigger if exists tr_sync_articles_on_edition_number_change on public.newspaper_editions;
create trigger tr_sync_articles_on_edition_number_change
after update of edition_number on public.newspaper_editions
for each row execute function public.sync_articles_on_edition_number_change();

create index if not exists articles_edition_sort_idx on public.articles
(edition_sort_number desc nulls last, newspaper_page asc nulls last, editorial_sort_at desc, id desc);
