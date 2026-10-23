-- Simulação PostgreSQL, sem dados do projeto real.
-- Requer finance-rls-sandbox-setup.sql + module-rls-sandbox-setup.sql.
create table public.articles(id uuid primary key,slug text,title text,status text default 'draft',urgent boolean default false,notification_mode text default 'none', created_by uuid,updated_by uuid,published_at timestamptz,scheduled_at timestamptz,updated_at timestamptz default now());
alter table public.articles enable row level security;
create policy articles_select_staff on public.articles for SELECT to authenticated using (public.is_active_staff());
create policy articles_insert_staff on public.articles for INSERT to authenticated with check (public.is_active_staff());
create policy articles_update_staff on public.articles for UPDATE to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create table public.article_media(id uuid primary key,article_id uuid,media_id uuid,role text,sort_order integer);
alter table public.article_media enable row level security;
create policy article_media_select_staff on public.article_media for SELECT to authenticated using (public.is_active_staff());
create policy article_media_insert_staff on public.article_media for INSERT to authenticated with check (public.is_active_staff());
create policy article_media_update_staff on public.article_media for UPDATE to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create policy article_media_delete_staff on public.article_media for DELETE to authenticated using (public.is_active_staff());
create table public.article_placements(id uuid primary key,article_id uuid,type text,active boolean default true);
alter table public.article_placements enable row level security;
create policy article_placements_select_staff on public.article_placements for SELECT to authenticated using (public.is_active_staff());
create policy article_placements_insert_staff on public.article_placements for INSERT to authenticated with check (public.is_active_staff());
create policy article_placements_update_staff on public.article_placements for UPDATE to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create table public.article_external_sources(id uuid primary key,article_id uuid,provider text);
alter table public.article_external_sources enable row level security;
create policy article_external_sources_select_staff on public.article_external_sources for SELECT to authenticated using (public.is_active_staff());
create policy article_external_sources_insert_staff on public.article_external_sources for INSERT to authenticated with check (public.is_active_staff());
create policy article_external_sources_update_staff on public.article_external_sources for UPDATE to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create table public.editorial_sections(id uuid primary key,name text,active boolean);
alter table public.editorial_sections enable row level security;
create policy editorial_sections_select_staff on public.editorial_sections for SELECT to authenticated using (public.is_active_staff());
create policy editorial_sections_insert_staff on public.editorial_sections for INSERT to authenticated with check (public.is_active_staff());
create policy editorial_sections_update_staff on public.editorial_sections for UPDATE to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create table public.localities(id uuid primary key,name text,active boolean);
alter table public.localities enable row level security;
create policy localities_select_staff on public.localities for SELECT to authenticated using (public.is_active_staff());
create policy localities_insert_staff on public.localities for INSERT to authenticated with check (public.is_active_staff());
create policy localities_update_staff on public.localities for UPDATE to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create table public.media_assets(id uuid primary key,title text,created_by uuid);
alter table public.media_assets enable row level security;
create policy media_assets_select_staff on public.media_assets for SELECT to authenticated using (public.is_active_staff());
create policy media_assets_insert_staff on public.media_assets for INSERT to authenticated with check (public.is_active_staff());
create policy media_assets_update_staff on public.media_assets for UPDATE to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create table public.newspaper_editions(id uuid primary key,edition_number int,active boolean default true);
alter table public.newspaper_editions enable row level security;
create policy newspaper_editions_select_staff on public.newspaper_editions for SELECT to authenticated using (public.is_active_staff());
create policy newspaper_editions_insert_staff on public.newspaper_editions for INSERT to authenticated with check (public.is_active_staff());
create policy newspaper_editions_update_staff on public.newspaper_editions for UPDATE to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create table public.pdf_import_batches(id uuid primary key,newspaper_edition_id uuid);
alter table public.pdf_import_batches enable row level security;
create policy pdf_import_batches_select_staff on public.pdf_import_batches for SELECT to authenticated using (public.is_active_staff());
create policy pdf_import_batches_insert_staff on public.pdf_import_batches for INSERT to authenticated with check (public.is_active_staff());
create policy pdf_import_batches_update_staff on public.pdf_import_batches for UPDATE to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create table public.pdf_import_candidates(id uuid primary key,batch_id uuid,newspaper_edition_id uuid,status text default 'pending');
alter table public.pdf_import_candidates enable row level security;
create policy pdf_import_candidates_select_staff on public.pdf_import_candidates for SELECT to authenticated using (public.is_active_staff());
create policy pdf_import_candidates_insert_staff on public.pdf_import_candidates for INSERT to authenticated with check (public.is_active_staff());
create policy pdf_import_candidates_update_staff_not_converted on public.pdf_import_candidates for UPDATE to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create table public.birthday_entries(id uuid primary key,display_name text,birth_month smallint,birth_day smallint,active boolean default true);
alter table public.birthday_entries enable row level security;
create policy birthday_entries_select_staff on public.birthday_entries for SELECT to authenticated using (public.is_active_staff());
create policy birthday_entries_insert_staff on public.birthday_entries for INSERT to authenticated with check (public.is_active_staff());
create policy birthday_entries_update_staff on public.birthday_entries for UPDATE to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create table public.birthday_edition_messages(id uuid primary key,birthday_entry_id uuid,message text);
alter table public.birthday_edition_messages enable row level security;
create policy birthday_edition_messages_select_staff on public.birthday_edition_messages for SELECT to authenticated using (public.is_active_staff());
create policy birthday_edition_messages_insert_staff on public.birthday_edition_messages for INSERT to authenticated with check (public.is_active_staff());
create policy birthday_edition_messages_update_staff on public.birthday_edition_messages for UPDATE to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create table public.birthday_message_templates(id uuid primary key,body text,active boolean default true);
alter table public.birthday_message_templates enable row level security;
create policy birthday_message_templates_select_staff on public.birthday_message_templates for SELECT to authenticated using (public.is_active_staff());
create policy birthday_message_templates_insert_admin on public.birthday_message_templates for INSERT to authenticated with check (public.is_active_admin_or_owner());
create policy birthday_message_templates_update_admin on public.birthday_message_templates for UPDATE to authenticated using (public.is_active_admin_or_owner()) with check (public.is_active_admin_or_owner());

-- A política pública da edição impressa permanece ativa na migration.
create policy newspaper_editions_select_public on public.newspaper_editions
for SELECT to anon using (active = true);
grant select,insert,update,delete on all tables in schema public to authenticated;
grant select on public.newspaper_editions to anon;

-- As 5 funções editoriais serão substituídas pelas versões reais das
-- migrations de endurecimento, mantendo assinaturas idênticas.
create or replace function public.convert_import_candidate_to_draft(
 p_candidate_id uuid,p_title text,p_subtitle text,p_body text,p_section_id uuid,
 p_locality_id uuid,p_page_number integer,p_media jsonb
) returns uuid language sql as $$select null::uuid$$;
create or replace function public.create_pdf_import_batch(
 p_newspaper_edition_id uuid,p_source_file_name text,p_file_hash text,
 p_page_count integer,p_pages_without_text integer[],p_warnings jsonb,p_candidates jsonb
) returns jsonb language sql as $$select '{}'::jsonb$$;
create or replace function public.legacy_import_article(article jsonb,source jsonb)
returns uuid language sql as $$select null::uuid$$;
create or replace function public.merge_import_candidates(
 p_primary_id uuid,p_secondary_ids uuid[],p_merged_body text,p_merged_media_ids uuid[]
) returns uuid language sql as $$select null::uuid$$;
create or replace function public.split_import_candidate(
 p_id uuid,p_first_body text,p_second_title text,p_second_body text
) returns jsonb language sql as $$select '{}'::jsonb$$;
create or replace function public.publish_due_scheduled_articles()
returns void language sql as $$select null::void$$;
create or replace function public.sync_site_offer_settings_to_commercial_products()
returns trigger language plpgsql as $$begin return new;end$$;
create or replace function public.reserve_next_dps_number(
 p_issuer_config_id uuid,p_environment text,p_series text
) returns bigint language sql as $$select 1::bigint$$;

insert into public.staff_module_visibility(profile_id,module_key,enabled) values
 ('00000000-0000-0000-0000-000000000002','editorial',true),
 ('00000000-0000-0000-0000-000000000002','aniversariantes',true),
 ('00000000-0000-0000-0000-000000000003','editorial',true);
insert into public.staff_module_action_permissions(profile_id,module_key,action_key,allowed) values
 ('00000000-0000-0000-0000-000000000002','editorial','materias_criar',true),
 ('00000000-0000-0000-0000-000000000002','aniversariantes','aniversariantes_gerenciar',true),
 ('00000000-0000-0000-0000-000000000003','editorial','materias_criar',true);
