-- Reordenacao atomica das imagens de cada posicao publicitaria.
create or replace function public.reorder_site_ad_media(
  p_slot_id uuid,
  p_media_ids uuid[]
) returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  expected_count integer;
  distinct_count integer;
  changed_count integer;
begin
  if p_slot_id is null or p_media_ids is null or
     array_position(p_media_ids, null) is not null then
    raise exception 'Posicao ou imagens invalidas';
  end if;

  select count(*) into expected_count
  from public.site_ad_media where slot_id = p_slot_id;

  select count(distinct item) into distinct_count
  from unnest(p_media_ids) as item;

  if expected_count <> cardinality(p_media_ids) or distinct_count <> expected_count
     or exists(
       select 1 from unnest(p_media_ids) as item(id)
       left join public.site_ad_media m
         on m.id = item.id and m.slot_id = p_slot_id
       where m.id is null
     )
  then
    raise exception 'A lista de imagens mudou. Atualize a pagina e tente novamente';
  end if;

  update public.site_ad_media m
  set sort_order = ordered.ordinal_position - 1
  from unnest(p_media_ids) with ordinality as ordered(id, ordinal_position)
  where m.slot_id = p_slot_id and m.id = ordered.id;

  get diagnostics changed_count = row_count;
  if changed_count <> expected_count then
    raise exception 'Nao foi possivel atualizar toda a ordem das imagens';
  end if;

  return changed_count;
end
$$;

revoke all on function public.reorder_site_ad_media(uuid,uuid[]) from public,anon;
grant execute on function public.reorder_site_ad_media(uuid,uuid[]) to authenticated;