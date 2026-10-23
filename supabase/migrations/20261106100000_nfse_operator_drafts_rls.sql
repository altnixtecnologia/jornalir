-- Delegação por ação do módulo fiscal (NFS-e).
-- Tabelas de certificado privado e sequência de DPS NÃO recebem grants novos.
-- Emissão e cancelamento efetivos CONTINUAM EXCLUSIVOS A OWNER/ADMIN;
-- opções de operadores devem permanecer desabilitadas até homologação
-- do serviço de transmissão e cancelamento. Pré-requisitos: matriz global
-- de permissões e confirmação de convite.

-- nfse_drafts
drop policy if exists nfse_drafts_select_admin_owner on public.nfse_drafts;
create policy nfse_drafts_select_staff on public.nfse_drafts for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('nfse'))));
drop policy if exists nfse_drafts_insert_admin_owner on public.nfse_drafts;
create policy nfse_drafts_insert_staff on public.nfse_drafts for INSERT to authenticated with check ((public.is_active_staff() and (public.staff_can_module_action('nfse','rascunhos_criar'))));
drop policy if exists nfse_drafts_update_admin_owner on public.nfse_drafts;
create policy nfse_drafts_update_staff on public.nfse_drafts for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('nfse','rascunhos_editar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('nfse','rascunhos_editar'))));

-- nfse_issued_notes
drop policy if exists nfse_issued_notes_select_admin_owner on public.nfse_issued_notes;
create policy nfse_issued_notes_select_staff on public.nfse_issued_notes for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('nfse'))));
drop policy if exists nfse_issued_notes_insert_admin_owner on public.nfse_issued_notes;
create policy nfse_issued_notes_insert_staff on public.nfse_issued_notes for INSERT to authenticated with check ((public.is_active_staff() and (public.is_active_admin_or_owner())));
drop policy if exists nfse_issued_notes_update_admin_owner on public.nfse_issued_notes;

-- nfse_transmission_attempts
drop policy if exists nfse_transmission_attempts_select_admin_owner on public.nfse_transmission_attempts;
create policy nfse_transmission_attempts_select_staff on public.nfse_transmission_attempts for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('nfse'))));
drop policy if exists nfse_transmission_attempts_insert_admin_owner on public.nfse_transmission_attempts;
create policy nfse_transmission_attempts_insert_staff on public.nfse_transmission_attempts for INSERT to authenticated with check ((public.is_active_staff() and (public.is_active_admin_or_owner())));
drop policy if exists nfse_transmission_attempts_update_admin_owner on public.nfse_transmission_attempts;

-- nfse_service_profiles
drop policy if exists nfse_service_profiles_select_admin_owner on public.nfse_service_profiles;
create policy nfse_service_profiles_select_staff on public.nfse_service_profiles for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('nfse'))));
drop policy if exists nfse_service_profiles_insert_admin_owner on public.nfse_service_profiles;
create policy nfse_service_profiles_insert_staff on public.nfse_service_profiles for INSERT to authenticated with check ((public.is_active_staff() and (public.staff_can_module_action('nfse','configuracoes_gerenciar'))));
drop policy if exists nfse_service_profiles_update_admin_owner on public.nfse_service_profiles;
create policy nfse_service_profiles_update_staff on public.nfse_service_profiles for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('nfse','configuracoes_gerenciar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('nfse','configuracoes_gerenciar'))));

-- nfse_issuer_configs
drop policy if exists nfse_issuer_configs_select_admin_owner on public.nfse_issuer_configs;
create policy nfse_issuer_configs_select_staff on public.nfse_issuer_configs for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('nfse'))));
drop policy if exists nfse_issuer_configs_insert_admin_owner on public.nfse_issuer_configs;
create policy nfse_issuer_configs_insert_staff on public.nfse_issuer_configs for INSERT to authenticated with check ((public.is_active_staff() and (public.staff_can_module_action('nfse','configuracoes_gerenciar'))));
drop policy if exists nfse_issuer_configs_update_admin_owner on public.nfse_issuer_configs;
create policy nfse_issuer_configs_update_staff on public.nfse_issuer_configs for UPDATE to authenticated using ((public.is_active_staff() and (public.staff_can_module_action('nfse','configuracoes_gerenciar')))) with check ((public.is_active_staff() and (public.staff_can_module_action('nfse','configuracoes_gerenciar'))));

-- nfse_cancellation_requests
drop policy if exists nfse_cancellation_requests_select_admin_owner on public.nfse_cancellation_requests;
create policy nfse_cancellation_requests_select_staff on public.nfse_cancellation_requests for SELECT to authenticated using ((public.is_active_staff() and (public.staff_can_see_module('nfse'))));
drop policy if exists nfse_cancellation_requests_insert_admin_owner on public.nfse_cancellation_requests;
create policy nfse_cancellation_requests_insert_staff on public.nfse_cancellation_requests for INSERT to authenticated with check ((public.is_active_staff() and (public.is_active_admin_or_owner())));
drop policy if exists nfse_cancellation_requests_update_admin_owner on public.nfse_cancellation_requests;

-- Campos administrativos do rascunho não podem ser alterados pelo
-- operador que apenas tem 'rascunhos_editar'. O serviço de emissão mantém
-- seu próprio gate de owner/admin, e pode mudar status sob essa identidade.
create or replace function public.enforce_nfse_draft_operator_fields()
returns trigger language plpgsql set search_path=''
as $$
begin
 if (select auth.uid()) is null or public.is_active_admin_or_owner() then return new; end if;
 if TG_OP='INSERT' then
   if new.status is distinct from 'draft' or new.transmission_locked_at is not null then
     raise exception 'Novo rascunho fiscal deve iniciar sem transmissão.' using errcode='42501';
   end if;
 elsif new.status is distinct from old.status
   or new.transmission_locked_at is distinct from old.transmission_locked_at
   or new.created_by is distinct from old.created_by
   or new.origin_system is distinct from old.origin_system
   or new.origin_type is distinct from old.origin_type
   or new.origin_record_id is distinct from old.origin_record_id
   or new.commercial_sale_id is distinct from old.commercial_sale_id then
   raise exception 'Sem permissão para alterar origem ou transmitir uma NFS-e.' using errcode='42501';
 end if;
 return new;
end;
$$;
drop trigger if exists nfse_drafts_guard_operator_fields on public.nfse_drafts;
create trigger nfse_drafts_guard_operator_fields
before insert or update on public.nfse_drafts for each row
execute function public.enforce_nfse_draft_operator_fields();

-- Solicitações de cancelamento são criadas apenas pelo fluxo de um admin.
-- O evento externo e101101 permanece não implementado até homologação.
create or replace function public.enforce_nfse_cancellation_request_insert()
returns trigger language plpgsql set search_path=''
as $$
begin
 if (select auth.uid()) is null then return new; end if;
 if not public.is_active_admin_or_owner() then
   raise exception 'Somente administrador pode solicitar cancelamento fiscal.' using errcode='42501';
 end if;
 if new.status <> 'pending' or new.submitted_at is not null then
   raise exception 'Solicitação fiscal deve iniciar pendente.' using errcode='23514';
 end if;
 return new;
end;
$$;
drop trigger if exists nfse_cancellation_requests_guard_insert on public.nfse_cancellation_requests;
create trigger nfse_cancellation_requests_guard_insert
before insert on public.nfse_cancellation_requests for each row
execute function public.enforce_nfse_cancellation_request_insert();
