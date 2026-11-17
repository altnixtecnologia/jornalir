-- Fonte original facultativa: somente link informativo, sem coleta ou importação.
alter table public.articles add column if not exists source_url text;
do $ begin
  if not exists (
    select 1 from pg_constraint where conname = 'articles_source_url_http_check'
      and conrelid = 'public.articles'::regclass
  ) then
    alter table public.articles add constraint articles_source_url_http_check
      check (source_url is null or (
        length(source_url) <= 2048 and source_url ~* '^https?://[^[:space:]/?#]+'
      ));
  end if;
end $;
-- Acrescentar ao fim, preservando ordem e colunas anteriores da view.
create or replace view public.public_articles as
  select id, slug, title, subtitle, title_style, subtitle_style, body,
    section_id, locality_id, urgent, published_at, created_at, updated_at,
    author_name, source_url
  from public.articles where status = 'published';
grant select on public.public_articles to anon;
comment on column public.articles.source_url is 'Link editorial opcional da fonte original; nunca aciona importação.';
