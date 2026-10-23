-- Dados de Editorial e Aniversariantes: autorização por ação também em PostgREST.
-- NÃO altera views públicas que exibem somente matérias publicadas nem
-- a política de leitura pública de edições ativas.
-- Pré-requisitos 20261102100000 (matriz), 20261103100000 (convites).
-- Testar com contas de homologação, mídia e editor de matérias antes do deploy.

-- articles
drop policy if exists articles_select_staff on public.articles;
create policy articles_select_staff on public.articles for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('editorial'))));
drop policy if exists articles_insert_staff on public.articles;
create policy articles_insert_staff on public.articles for INSERT to authenticated with check ((public.is_active_staff() and (public.staff_can_module_action('editorial','materias_criar'))));
drop policy if exists articles_update_staff on public.articles;
create policy articles_update_staff on public.articles for UPDATE to authenticated using ((public.is_active_staff() and ((public.staff_can_module_action('editorial','materias_editar') or public.staff_can_module_action('editorial','materias_publicar') or public.staff_can_module_action('editorial','materias_arquivar'))))) with check ((public.is_active_staff() and ((public.staff_can_module_action('editorial','materias_editar') or public.staff_can_module_action('editorial','materias_publicar') or public.staff_can_module_action('editorial','materias_arquivar')))));
drop policy if exists articles_delete_staff on public.articles;

-- article_media
drop policy if exists article_media_select_staff on public.article_media;
create policy article_media_select_staff on public.article_media for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('editorial'))));
drop policy if exists article_media_insert_staff on public.article_media;
create policy article_media_insert_staff on public.article_media for INSERT to authenticated with check ((public.is_active_staff() and ((public.staff_can_module_action('editorial','materias_criar') or public.staff_can_module_action('editorial','materias_editar')))));
drop policy if exists article_media_update_staff on public.article_media;
create policy article_media_update_staff on public.article_media for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('editorial','materias_editar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('editorial','materias_editar'))));
drop policy if exists article_media_delete_staff on public.article_media;
create policy article_media_delete_staff on public.article_media for DELETE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('editorial','materias_editar'))));

-- article_placements
drop policy if exists article_placements_select_staff on public.article_placements;
create policy article_placements_select_staff on public.article_placements for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('editorial'))));
drop policy if exists article_placements_insert_staff on public.article_placements;
create policy article_placements_insert_staff on public.article_placements for INSERT to authenticated with check ((public.is_active_staff() and ((public.staff_can_module_action('editorial','materias_publicar') or public.staff_can_module_action('editorial','edicoes_gerenciar')))));
drop policy if exists article_placements_update_staff on public.article_placements;
create policy article_placements_update_staff on public.article_placements for UPDATE to authenticated using ((public.is_active_staff() and ((public.staff_can_module_action('editorial','materias_publicar') or public.staff_can_module_action('editorial','edicoes_gerenciar'))))) with check ((public.is_active_staff() and ((public.staff_can_module_action('editorial','materias_publicar') or public.staff_can_module_action('editorial','edicoes_gerenciar')))));
drop policy if exists article_placements_delete_staff on public.article_placements;

-- article_external_sources
drop policy if exists article_external_sources_select_staff on public.article_external_sources;
create policy article_external_sources_select_staff on public.article_external_sources for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('editorial'))));
drop policy if exists article_external_sources_insert_staff on public.article_external_sources;
create policy article_external_sources_insert_staff on public.article_external_sources for INSERT to authenticated with check ((public.is_active_staff() and ((public.staff_can_module_action('editorial','materias_criar') or public.staff_can_module_action('editorial','materias_editar')))));
drop policy if exists article_external_sources_update_staff on public.article_external_sources;
create policy article_external_sources_update_staff on public.article_external_sources for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('editorial','materias_editar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('editorial','materias_editar'))));
drop policy if exists article_external_sources_delete_staff on public.article_external_sources;

-- editorial_sections
drop policy if exists editorial_sections_select_staff on public.editorial_sections;
create policy editorial_sections_select_staff on public.editorial_sections for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('editorial'))));
drop policy if exists editorial_sections_insert_staff on public.editorial_sections;
create policy editorial_sections_insert_staff on public.editorial_sections for INSERT to authenticated with check ((public.is_active_staff() and (public.staff_can_module_action('editorial','edicoes_gerenciar'))));
drop policy if exists editorial_sections_update_staff on public.editorial_sections;
create policy editorial_sections_update_staff on public.editorial_sections for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('editorial','edicoes_gerenciar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('editorial','edicoes_gerenciar'))));
drop policy if exists editorial_sections_delete_staff on public.editorial_sections;

-- localities
drop policy if exists localities_select_staff on public.localities;
create policy localities_select_staff on public.localities for SELECT to authenticated using ((public.is_active_staff() and ((public.staff_can_see_module('editorial') or public.staff_can_see_module('publicidade')))));
drop policy if exists localities_insert_staff on public.localities;
create policy localities_insert_staff on public.localities for INSERT to authenticated with check ((public.is_active_staff() and (public.staff_can_module_action('editorial','edicoes_gerenciar'))));
drop policy if exists localities_update_staff on public.localities;
create policy localities_update_staff on public.localities for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('editorial','edicoes_gerenciar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('editorial','edicoes_gerenciar'))));
drop policy if exists localities_delete_staff on public.localities;

-- media_assets
drop policy if exists media_assets_select_staff on public.media_assets;
create policy media_assets_select_staff on public.media_assets for SELECT to authenticated using ((public.is_active_staff() and ((public.staff_can_see_module('editorial') or public.staff_can_see_module('publicidade') or public.staff_can_see_module('aniversariantes')))));
drop policy if exists media_assets_insert_staff on public.media_assets;
create policy media_assets_insert_staff on public.media_assets for INSERT to authenticated with check ((public.is_active_staff() and ((public.staff_can_module_action('editorial','midias_gerenciar') or public.staff_can_module_action('editorial','materias_criar') or public.staff_can_module_action('aniversariantes','aniversariantes_gerenciar')))));
drop policy if exists media_assets_update_staff on public.media_assets;
create policy media_assets_update_staff on public.media_assets for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('editorial','midias_gerenciar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('editorial','midias_gerenciar'))));
drop policy if exists media_assets_delete_staff on public.media_assets;

-- newspaper_editions
drop policy if exists newspaper_editions_select_staff on public.newspaper_editions;
create policy newspaper_editions_select_staff on public.newspaper_editions for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('editorial'))));
drop policy if exists newspaper_editions_insert_staff on public.newspaper_editions;
create policy newspaper_editions_insert_staff on public.newspaper_editions for INSERT to authenticated with check ((public.is_active_staff() and (public.staff_can_module_action('editorial','edicoes_gerenciar'))));
drop policy if exists newspaper_editions_update_staff on public.newspaper_editions;
create policy newspaper_editions_update_staff on public.newspaper_editions for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('editorial','edicoes_gerenciar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('editorial','edicoes_gerenciar'))));
drop policy if exists newspaper_editions_delete_staff on public.newspaper_editions;

-- pdf_import_batches
drop policy if exists pdf_import_batches_select_staff on public.pdf_import_batches;
create policy pdf_import_batches_select_staff on public.pdf_import_batches for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('editorial'))));
drop policy if exists pdf_import_batches_insert_staff on public.pdf_import_batches;
create policy pdf_import_batches_insert_staff on public.pdf_import_batches for INSERT to authenticated with check ((public.is_active_staff() and ((public.staff_can_module_action('editorial','materias_criar') or public.staff_can_module_action('editorial','edicoes_gerenciar')))));
drop policy if exists pdf_import_batches_update_staff on public.pdf_import_batches;
drop policy if exists pdf_import_batches_delete_staff on public.pdf_import_batches;

-- pdf_import_candidates
drop policy if exists pdf_import_candidates_select_staff on public.pdf_import_candidates;
create policy pdf_import_candidates_select_staff on public.pdf_import_candidates for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('editorial'))));
drop policy if exists pdf_import_candidates_insert_staff on public.pdf_import_candidates;
create policy pdf_import_candidates_insert_staff on public.pdf_import_candidates for INSERT to authenticated with check ((public.is_active_staff() and (public.staff_can_module_action('editorial','materias_criar'))));
drop policy if exists pdf_import_candidates_update_staff_not_converted on public.pdf_import_candidates;
create policy pdf_import_candidates_update_staff on public.pdf_import_candidates for UPDATE to authenticated using ((public.is_active_staff() and ((public.staff_can_module_action('editorial','materias_editar') and status <> 'converted')))) with check ((public.is_active_staff() and ((public.staff_can_module_action('editorial','materias_editar') and status <> 'converted'))));
drop policy if exists pdf_import_candidates_delete_staff on public.pdf_import_candidates;

-- birthday_entries
drop policy if exists birthday_entries_select_staff on public.birthday_entries;
create policy birthday_entries_select_staff on public.birthday_entries for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('aniversariantes'))));
drop policy if exists birthday_entries_insert_staff on public.birthday_entries;
create policy birthday_entries_insert_staff on public.birthday_entries for INSERT to authenticated with check ((public.is_active_staff() and (public.staff_can_module_action('aniversariantes','aniversariantes_gerenciar'))));
drop policy if exists birthday_entries_update_staff on public.birthday_entries;
create policy birthday_entries_update_staff on public.birthday_entries for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('aniversariantes','aniversariantes_gerenciar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('aniversariantes','aniversariantes_gerenciar'))));
drop policy if exists birthday_entries_delete_staff on public.birthday_entries;

-- birthday_edition_messages
drop policy if exists birthday_edition_messages_select_staff on public.birthday_edition_messages;
create policy birthday_edition_messages_select_staff on public.birthday_edition_messages for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('aniversariantes'))));
drop policy if exists birthday_edition_messages_insert_staff on public.birthday_edition_messages;
create policy birthday_edition_messages_insert_staff on public.birthday_edition_messages for INSERT to authenticated with check ((public.is_active_staff() and (public.staff_can_module_action('aniversariantes','mensagens_gerenciar'))));
drop policy if exists birthday_edition_messages_update_staff on public.birthday_edition_messages;
create policy birthday_edition_messages_update_staff on public.birthday_edition_messages for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('aniversariantes','mensagens_gerenciar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('aniversariantes','mensagens_gerenciar'))));
drop policy if exists birthday_edition_messages_delete_staff on public.birthday_edition_messages;

-- birthday_message_templates
drop policy if exists birthday_message_templates_select_staff on public.birthday_message_templates;
create policy birthday_message_templates_select_staff on public.birthday_message_templates for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('aniversariantes'))));
drop policy if exists birthday_message_templates_insert_admin on public.birthday_message_templates;
create policy birthday_message_templates_insert_staff on public.birthday_message_templates for INSERT to authenticated with check ((public.is_active_staff() and (public.staff_can_module_action('aniversariantes','mensagens_gerenciar'))));
drop policy if exists birthday_message_templates_update_admin on public.birthday_message_templates;
create policy birthday_message_templates_update_staff on public.birthday_message_templates for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('aniversariantes','mensagens_gerenciar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('aniversariantes','mensagens_gerenciar'))));
drop policy if exists birthday_message_templates_delete_staff on public.birthday_message_templates;

-- Edição de matéria não concede publicar/agendar nem criar alertas urgentes.
-- Proíbe a emissão direta de material publicado por um usuário autorizado
-- somente a criar rascunhos. A rotina de cron usa role interno, não JWT.
create or replace function public.enforce_editorial_publication_actions()
returns trigger language plpgsql set search_path=''
as $$
begin
  if (select auth.uid()) is null or public.is_active_admin_or_owner() then return new; end if;
  if TG_OP='INSERT' then
    if new.status in ('published','scheduled') and
      not public.staff_can_module_action('editorial','materias_publicar') then
      raise exception 'Sem permissão para publicar/agendar matéria.' using errcode='42501';
    end if;
    if (new.urgent or new.notification_mode is distinct from 'none') and
      not public.staff_can_module_action('editorial','materias_publicar') then
      raise exception 'Sem permissão para emitir alertas editoriais.' using errcode='42501';
    end if;
    return new;
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'Autoria original não pode ser alterada.' using errcode='42501';
  end if;
  if new.status is distinct from old.status then
    if new.status in ('published','scheduled') then
      if not public.staff_can_module_action('editorial','materias_publicar') then
        raise exception 'Sem permissão para publicar ou agendar.' using errcode='42501';
      end if;
    elsif new.status='archived' then
      if not public.staff_can_module_action('editorial','materias_arquivar') then
        raise exception 'Sem permissão para arquivar.' using errcode='42501';
      end if;
    elsif old.status in ('published','archived') then
      raise exception 'Não é permitido voltar matéria publicada/arquivada a rascunho.' using errcode='23514';
    elsif not public.staff_can_module_action('editorial','materias_editar') then
      raise exception 'Sem permissão para alterar situação editorial.' using errcode='42501';
    end if;
  end if;
  if (new.published_at is distinct from old.published_at
    or new.scheduled_at is distinct from old.scheduled_at
    or new.urgent is distinct from old.urgent
    or new.notification_mode is distinct from old.notification_mode)
    and not public.staff_can_module_action('editorial','materias_publicar') then
    raise exception 'Sem permissão para alterar publicação ou alertas.' using errcode='42501';
  end if;
  if (to_jsonb(new) - 'status' - 'published_at' - 'scheduled_at' -
      'urgent' - 'notification_mode' - 'updated_at' - 'updated_by')
    is distinct from
    (to_jsonb(old) - 'status' - 'published_at' - 'scheduled_at' -
      'urgent' - 'notification_mode' - 'updated_at' - 'updated_by')
    and not public.staff_can_module_action('editorial','materias_editar') then
    raise exception 'Sem permissão para modificar o conteúdo.' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists articles_guard_publication_action on public.articles;
create trigger articles_guard_publication_action
before insert or update on public.articles
for each row execute function public.enforce_editorial_publication_actions();

-- Verificar nenhuma política antiga permissiva permaneceu nas tabelas
-- específicas; a política pública das edições ativas deve ser preservada.
do $audit$
declare v_count integer;
begin
 select count(*) into v_count from pg_policies
 where schemaname='public'
   and tablename=any(array['articles','article_media','article_placements','article_external_sources','editorial_sections','localities','media_assets','newspaper_editions','pdf_import_batches','pdf_import_candidates','birthday_entries','birthday_edition_messages','birthday_message_templates'])
   and (qual='is_active_staff()' or with_check='is_active_staff()');
 if v_count>0 then
   raise exception 'Editorial/Aniversariantes: % políticas genéricas permaneceram.',v_count;
 end if;
end;
$audit$;
