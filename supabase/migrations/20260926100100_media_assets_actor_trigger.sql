-- Fase 26 (continuação, mesma fase) — `created_by` de `media_assets` deve
-- ser a identidade real da sessão, nunca um valor vindo do cliente, mesmo
-- princípio de `set_article_actor` (Fase 25). Incremental — não altera a
-- migration anterior desta mesma fase.

create or replace function public.set_media_asset_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

comment on function public.set_media_asset_actor() is
  'created_by sempre auth.uid() da sessão autenticada — ignora qualquer valor vindo do cliente.';

create trigger media_assets_set_actor
  before insert on public.media_assets
  for each row
  execute function public.set_media_asset_actor();
