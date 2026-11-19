-- Jornal IR: registrar revisões editoriais reais em matérias JÁ publicadas.
-- Implementação aditiva: não preenche datas antigas por updated_at (alterado
-- em migrações e rotinas técnicas), não modifica published_at nem status.
-- A view pública conserva a mesma lista de colunas, acrescentando só a última.

alter table public.articles
  add column if not exists editorial_edited_at timestamptz;

comment on column public.articles.editorial_edited_at is
  'Última edição editorial feita após a publicação: texto/campos editoriais ou mídia; nunca usar updated_at técnico como substituto.';

create or replace function public.track_article_editorial_content_edit()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.status = 'published'
     and new.status = 'published'
     and old.published_at is not null
     and (
       new.title, new.subtitle, new.body, new.source_url,
       new.title_style, new.subtitle_style, new.section_id,
       new.locality_id, new.urgent
     ) is distinct from (
       old.title, old.subtitle, old.body, old.source_url,
       old.title_style, old.subtitle_style, old.section_id,
       old.locality_id, old.urgent
     )
  then
    new.editorial_edited_at := statement_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists articles_track_editorial_content_edit on public.articles;
create trigger articles_track_editorial_content_edit
before update on public.articles for each row
execute function public.track_article_editorial_content_edit();

-- Uma troca de capa, edição de legenda/crédito ou alteração da ordem da
-- galeria também é edição editorial. Só marca matérias já publicadas;
-- importação/edição de rascunhos não recebe aviso indevido.
create or replace function public.track_article_editorial_media_edit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  target_id uuid;
begin
  if tg_op = 'UPDATE'
     and (new.article_id, new.media_id, new.role, new.sort_order,
          new.caption_override, new.credit_override)
         is not distinct from
         (old.article_id, old.media_id, old.role, old.sort_order,
          old.caption_override, old.credit_override)
  then
    return new;
  end if;

  target_id := case when tg_op = 'DELETE' then old.article_id else new.article_id end;

  update public.articles
     set editorial_edited_at = statement_timestamp()
   where id = target_id and status = 'published' and published_at is not null;

  if tg_op = 'UPDATE' and old.article_id is distinct from new.article_id then
    update public.articles
       set editorial_edited_at = statement_timestamp()
     where id = old.article_id and status = 'published' and published_at is not null;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists article_media_track_editorial_edit on public.article_media;
create trigger article_media_track_editorial_edit
after insert or update or delete on public.article_media
for each row execute function public.track_article_editorial_media_edit();

-- Segurança/compatibilidade: preservar exatamente as colunas e o filtro da
-- view atual. A nova coluna é acrescentada por último, nunca expõe rascunhos.
create or replace view public.public_articles as
select
  id, slug, title, subtitle, title_style, subtitle_style, body,
  section_id, locality_id, urgent, published_at, created_at,
  updated_at, author_name, source_url, editorial_edited_at
from public.articles
where status = 'published';
