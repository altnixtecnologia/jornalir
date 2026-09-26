-- Fase 35B — hardening antes da primeira gravação real do legado. Nenhuma
-- gravação de conteúdo acontece nesta migration — só schema (item 2).

-- Import atômico matéria+proveniência (item 2): hoje o importador faz dois
-- inserts separados (articles, depois article_external_sources) via
-- REST; se a conexão cair entre os dois, sobra um artigo sem
-- rastreabilidade (órfão) ou, numa reexecução, risco de duplicar. Uma
-- função `security definer` executa os dois inserts na MESMA transação
-- implícita da chamada RPC — se qualquer parte falhar, nada é gravado.
create or replace function public.legacy_import_article(
  article jsonb,
  source jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_article_id uuid;
begin
  -- security definer roda com privilégio do dono da função (bypassa RLS)
  -- mesmo para uma chamada autenticada comum — por isso a checagem de
  -- staff é feita aqui explicitamente. service_role não passa por auth.role()
  -- como 'authenticated', então não é afetado por esta checagem.
  if auth.role() = 'authenticated' and not public.is_active_staff() then
    raise exception 'legacy_import_article: apenas staff ativo pode importar conteúdo do legado';
  end if;

  insert into public.articles (
    slug, title, subtitle, body, section_id, locality_id,
    status, origin, published_at, author_name
  )
  values (
    article->>'slug',
    article->>'title',
    article->>'subtitle',
    coalesce(article->>'body', ''),
    (article->>'section_id')::uuid,
    (article->>'locality_id')::uuid,
    coalesce(article->>'status', 'published'),
    coalesce(article->>'origin', 'legacy_site'),
    (article->>'published_at')::timestamptz,
    article->>'author_name'
  )
  returning id into new_article_id;

  insert into public.article_external_sources (
    article_id, provider, external_id, source_url, source_slug,
    original_category, original_subcategory, original_author,
    original_published_at, source_hash, raw_metadata
  )
  values (
    new_article_id,
    source->>'provider',
    source->>'external_id',
    source->>'source_url',
    source->>'source_slug',
    source->>'original_category',
    source->>'original_subcategory',
    source->>'original_author',
    (source->>'original_published_at')::timestamptz,
    source->>'source_hash',
    coalesce(source->'raw_metadata', '{}'::jsonb)
  );

  return new_article_id;
end;
$$;

comment on function public.legacy_import_article is
  'Cria articles + article_external_sources na mesma transação (item 2, Fase 35B) — nunca deixa um artigo sem proveniência nem uma proveniência órfã. security definer porque a importação roda com service_role (sem auth.uid()), mas as duas tabelas continuam com RLS normal para todo outro acesso.';

-- Só quem já teria permissão de inserir nas duas tabelas (staff autenticado
-- ou service_role, que bypassa RLS) deve poder chamar esta função.
revoke all on function public.legacy_import_article(jsonb, jsonb) from public;
grant execute on function public.legacy_import_article(jsonb, jsonb) to authenticated, service_role;
