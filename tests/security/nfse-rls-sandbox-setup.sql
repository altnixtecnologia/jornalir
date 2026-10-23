-- Base isolada para simular acesso à NFS-e.
-- Nunca armazena XML, credenciais, certificados reais ou dados fiscais reais.
create table public.nfse_drafts(id uuid primary key,status text default 'draft',transmission_locked_at timestamptz,service_value numeric,created_by uuid,origin_system text,origin_type text,origin_record_id text,commercial_sale_id uuid);
alter table public.nfse_drafts enable row level security;
create policy nfse_drafts_select_admin_owner on public.nfse_drafts for SELECT to authenticated using (public.is_active_admin_or_owner());
create policy nfse_drafts_insert_admin_owner on public.nfse_drafts for INSERT to authenticated with check (public.is_active_admin_or_owner());
create policy nfse_drafts_update_admin_owner on public.nfse_drafts for UPDATE to authenticated using (public.is_active_admin_or_owner()) with check (public.is_active_admin_or_owner());
create table public.nfse_issued_notes(id uuid primary key,draft_id uuid,service_value numeric);
alter table public.nfse_issued_notes enable row level security;
create policy nfse_issued_notes_select_admin_owner on public.nfse_issued_notes for SELECT to authenticated using (public.is_active_admin_or_owner());
create policy nfse_issued_notes_insert_admin_owner on public.nfse_issued_notes for INSERT to authenticated with check (public.is_active_admin_or_owner());
create table public.nfse_transmission_attempts(id uuid primary key,draft_id uuid,status text);
alter table public.nfse_transmission_attempts enable row level security;
create policy nfse_transmission_attempts_select_admin_owner on public.nfse_transmission_attempts for SELECT to authenticated using (public.is_active_admin_or_owner());
create policy nfse_transmission_attempts_insert_admin_owner on public.nfse_transmission_attempts for INSERT to authenticated with check (public.is_active_admin_or_owner());
create table public.nfse_service_profiles(id uuid primary key,name text,active boolean default true);
alter table public.nfse_service_profiles enable row level security;
create policy nfse_service_profiles_select_admin_owner on public.nfse_service_profiles for SELECT to authenticated using (public.is_active_admin_or_owner());
create policy nfse_service_profiles_insert_admin_owner on public.nfse_service_profiles for INSERT to authenticated with check (public.is_active_admin_or_owner());
create policy nfse_service_profiles_update_admin_owner on public.nfse_service_profiles for UPDATE to authenticated using (public.is_active_admin_or_owner()) with check (public.is_active_admin_or_owner());
create table public.nfse_issuer_configs(id uuid primary key,company_name text,certificate_reference text);
alter table public.nfse_issuer_configs enable row level security;
create policy nfse_issuer_configs_select_admin_owner on public.nfse_issuer_configs for SELECT to authenticated using (public.is_active_admin_or_owner());
create policy nfse_issuer_configs_insert_admin_owner on public.nfse_issuer_configs for INSERT to authenticated with check (public.is_active_admin_or_owner());
create policy nfse_issuer_configs_update_admin_owner on public.nfse_issuer_configs for UPDATE to authenticated using (public.is_active_admin_or_owner()) with check (public.is_active_admin_or_owner());
create table public.nfse_cancellation_requests(id uuid primary key,issued_note_id uuid,status text default 'pending',submitted_at timestamptz);
alter table public.nfse_cancellation_requests enable row level security;
create table public.nfse_certificates(id uuid primary key,issuer_config_id uuid,private_key_ciphertext text);
alter table public.nfse_certificates enable row level security;
create table public.nfse_dps_sequences(id uuid primary key,issuer_config_id uuid,next_number bigint);
alter table public.nfse_dps_sequences enable row level security;
create policy nfse_dps_sequences_select_admin_owner on public.nfse_dps_sequences for SELECT to authenticated using (public.is_active_admin_or_owner());

grant select,insert,update on all tables in schema public to authenticated;
insert into public.staff_module_visibility(profile_id,module_key,enabled)
 values('00000000-0000-0000-0000-000000000002','nfse',true);
insert into public.staff_module_action_permissions(profile_id,module_key,action_key,allowed) values
 ('00000000-0000-0000-0000-000000000002','nfse','rascunhos_criar',true);
insert into public.nfse_issued_notes(id,service_value)
values('90000000-0000-0000-0000-000000000001',200);
insert into public.nfse_certificates(id,private_key_ciphertext)
values('90000000-0000-0000-0000-000000000002','SEGREDO_FICTICIO');
