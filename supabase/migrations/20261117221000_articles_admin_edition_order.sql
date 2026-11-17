-- Classificação inicial por número de edição, sem criar agrupamentos.
-- SECURITY INVOKER respeita as permissões e RLS das tabelas de origem.
create or replace view public.articles_admin_edition_order
with (security_invoker = true) as
select a.*, ne.edition_number as edition_sort_number
from public.articles a
left join public.newspaper_editions ne on ne.id = a.newspaper_edition_id;
grant select on public.articles_admin_edition_order to authenticated;
comment on view public.articles_admin_edition_order is
  'Lista administrativa de matérias com edição para ordenação, sob RLS de quem consulta.';
