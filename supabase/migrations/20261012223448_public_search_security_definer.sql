create or replace function public.search_public_articles(
  p_search text,
  p_section_id uuid default null,
  p_date_from date default null,
  p_date_to date default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid,
  slug text,
  title text,
  subtitle text,
  body text,
  section_id uuid,
  locality_id uuid,
  urgent boolean,
  published_at timestamptz,
  total_count bigint,
  match_source text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with params as (
    select replace(replace(replace(public.ir_unaccent(lower(trim(coalesce(p_search, '')))), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') as term
  ),
  candidates as (
    select
      a.id, a.slug, a.title, a.subtitle, a.body, a.section_id, a.locality_id, a.urgent, a.published_at,
      case
        when public.ir_unaccent(lower(a.title)) like ('%' || params.term || '%') escape E'\\' then 1
        when public.ir_unaccent(lower(coalesce(a.subtitle, ''))) like ('%' || params.term || '%') escape E'\\' then 2
        when public.ir_unaccent(lower(a.body)) like ('%' || params.term || '%') escape E'\\' then 3
        else null
      end as match_priority
    from public.articles a
    cross join params
    where a.status = 'published'
      and params.term <> ''
      and (p_section_id is null or a.section_id = p_section_id)
      and (p_date_from is null or a.published_at >= p_date_from::timestamptz)
      and (p_date_to is null or a.published_at < (p_date_to + 1)::timestamptz)
      and (
        public.ir_unaccent(lower(a.title)) like ('%' || params.term || '%') escape E'\\'
        or public.ir_unaccent(lower(coalesce(a.subtitle, ''))) like ('%' || params.term || '%') escape E'\\'
        or public.ir_unaccent(lower(a.body)) like ('%' || params.term || '%') escape E'\\'
      )
  ),
  chosen_priority as (
    select min(match_priority) as priority from candidates where match_priority is not null
  ),
  chosen as (
    select c.* from candidates c cross join chosen_priority p where c.match_priority = p.priority
  )
  select
    c.id, c.slug, c.title, c.subtitle, c.body, c.section_id, c.locality_id, c.urgent, c.published_at,
    count(*) over() as total_count,
    case c.match_priority when 1 then 'title' when 2 then 'subtitle' else 'body' end as match_source
  from chosen c
  order by c.published_at desc, c.id desc
  limit greatest(1, least(coalesce(p_limit, 24), 100))
  offset greatest(0, coalesce(p_offset, 0))
$$;

revoke all on function public.search_public_articles(text, uuid, date, date, integer, integer) from public;
grant execute on function public.search_public_articles(text, uuid, date, date, integer, integer) to anon, authenticated;
