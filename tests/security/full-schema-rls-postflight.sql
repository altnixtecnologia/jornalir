-- Verificações de esquema real após replay completo no Supabase local.
-- NÃO usa clientes, certificados ou dados reais.
do $check$
declare
  v_missing text[];
  v_count int;
begin
 select array_agg(t.table_name) into v_missing
 from (values ('staff_module_action_permissions'),('clients'),('subscriptions'),
 ('commercial_products'),('commercial_proposals'),('commercial_sales'),
 ('equipment_assets_placeholder_skipped')) as t(table_name)
 where t.table_name<>'equipment_assets_placeholder_skipped'
   and to_regclass('public.'||t.table_name) is null;
 if v_missing is not null then
   raise exception 'Tabelas ausentes após migrations: %',v_missing;
 end if;

 if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='commercial_sales'
      and column_name='items_snapshot') then
   raise exception 'Itens históricos da venda não foram adicionados.';
 end if;

 if not exists (select 1 from pg_constraint c
    join pg_class r on r.oid=c.conrelid
    where r.relname='commercial_products'
      and c.conname='commercial_products_channel_check'
      and pg_get_constraintdef(c.oid) like '%equipment_rental%') then
   raise exception 'Locação não consta do catálogo.';
 end if;

 if not exists (select 1 from pg_constraint c
    where c.conname='staff_module_actions_known_pair'
      and pg_get_constraintdef(c.oid) like '%perfis_servico_gerenciar%') then
   raise exception 'Ações da NFS-e fora da matriz real.';
 end if;

 if has_function_privilege('anon','public.publish_due_scheduled_articles()','EXECUTE')
    or has_function_privilege('authenticated','public.publish_due_scheduled_articles()','EXECUTE')
    or has_function_privilege('anon','public.save_client(uuid,jsonb,text[])','EXECUTE')
    or has_function_privilege('anon','public.legacy_import_article(jsonb,jsonb)','EXECUTE') then
   raise exception 'Função privilegiada ainda exposta na API.';
 end if;

 if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='receivables_with_balance'
   and 'security_invoker=true'=any(c.reloptions)) then
   raise exception 'View de valores a receber não obedece à RLS.';
 end if;

 select count(*) into v_count from pg_policies
 where schemaname='public'
   and tablename=any(array[
      'clients','subscriptions','commercial_products','commercial_proposals',
      'commercial_proposal_items','commercial_sales','articles','media_assets',
      'birthday_entries','birthday_edition_messages','nfse_drafts',
      'receivables','receivable_receipts'
   ])
   and (qual='is_active_staff()' or with_check='is_active_staff()');
 if v_count>0 then
   raise exception 'Restaram % políticas amplas nos módulos protegidos.',v_count;
 end if;

 if not exists (select 1 from pg_trigger t join pg_class c on t.tgrelid=c.oid
     where c.relname='articles' and t.tgname='articles_guard_publication_action'
     and not t.tgisinternal) then
   raise exception 'Falta proteção da publicação editorial.';
 end if;

 if to_regclass('public.commercial_contract_template_assignments') is null then
   raise exception 'Vínculo de modelos jurídicos comerciais ausente.';
 end if;
 if not exists (select 1 from pg_trigger t join pg_class c on t.tgrelid=c.oid
   where c.relname='commercial_contract_template_assignments'
   and t.tgname='commercial_template_assignments_validate' and not t.tgisinternal) then
   raise exception 'Modelos comerciais sem validação de categoria/versão.';
 end if;
 if to_regclass('public.commercial_contract_packages') is null
    or to_regclass('public.commercial_contract_services') is null then
   raise exception 'Estrutura de contratação comercial ausente.';
 end if;
 if not exists(select 1 from pg_proc where pronamespace='public'::regnamespace
   and proname='prepare_commercial_contract') then
   raise exception 'Função transacional de preparação de contratos ausente.';
 end if;
 if has_function_privilege('anon','public.prepare_commercial_contract(uuid,text)','EXECUTE') then
   raise exception 'Preparação de contrato exposta ao público.';
 end if;
 if to_regclass('public.rental_assets') is null or
    to_regclass('public.rental_bookings') is null or
    to_regclass('public.rental_inspection_events') is null then
   raise exception 'Inventário/reservas/vistorias ausentes na base integrada.';
 end if;
 if not exists (select 1 from pg_constraint c
  join pg_class t on t.oid=c.conrelid
  where t.relname='rental_bookings' and c.conname='rental_bookings_no_overlap' and c.contype='x') then
   raise exception 'Bloqueio contra dupla reserva de equipamento ausente.';
 end if;
 if not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
  where c.relname='rental_inspection_events' and t.tgname='rental_inspections_validate'
  and not t.tgisinternal) then
   raise exception 'Vistoria sem proteção contra alterações.';
 end if;
 if not exists (select 1 from pg_trigger t join pg_class c on t.tgrelid=c.oid
     where c.relname='nfse_drafts' and t.tgname='nfse_drafts_guard_operator_fields'
     and not t.tgisinternal) then
   raise exception 'Falta proteção do rascunho fiscal.';
 end if;
 if has_function_privilege('anon','public.reserve_commercial_signature_otp(text)','EXECUTE')
    or has_function_privilege('authenticated','public.reserve_commercial_signature_otp(text)','EXECUTE')
    or not has_function_privilege('service_role','public.reserve_commercial_signature_otp(text)','EXECUTE') then
   raise exception 'Limite OTP comercial não protegido por service_role.';
 end if;
 if to_regclass('public.billing_notification_dispatches') is null
    or not exists(select 1 from pg_constraint
      where conrelid='public.billing_notification_dispatches'::regclass
        and conname='billing_notification_dispatches_once' and contype='u') then
   raise exception 'Reserva idempotente do WhatsApp ausente.';
 end if;
 if has_table_privilege('authenticated','public.billing_notification_dispatches','UPDATE')
    or has_table_privilege('authenticated','public.billing_notification_dispatches','INSERT')
    or has_table_privilege('anon','public.billing_notification_dispatches','SELECT') then
   raise exception 'Operador pode adulterar reserva do WhatsApp.';
 end if;
 if has_table_privilege('authenticated','public.payment_charges','UPDATE') then
   raise exception 'Pix permite PATCH direto por usuário autenticado.';
 end if;
 if not exists(select 1 from information_schema.columns
   where table_schema='public' and table_name='billing_webhook_events' and column_name='processing_token') then
   raise exception 'Webhook não possui token para bloquear concorrência.';
 end if;
 if to_regclass('public.staff_memberships') is null then
   raise exception 'Memberships de colaboradores inexistentes.';
 end if;
 if has_table_privilege('anon','public.staff_memberships','SELECT')
   or has_table_privilege('authenticated','public.staff_memberships','INSERT')
   or has_table_privilege('authenticated','public.staff_memberships','UPDATE')
   or has_table_privilege('authenticated','public.staff_memberships','DELETE') then
   raise exception 'Memberships de colaboradores podem ser adulteradas.';
 end if;
 if not exists(select 1 from pg_policies
  where schemaname='public' and tablename='staff_memberships'
    and policyname='staff_memberships_read') then
   raise exception 'Memberships não possuem RLS de leitura.';
 end if;
 if to_regclass('public.commercial_contract_addenda') is null
   or to_regclass('public.commercial_contract_addendum_events') is null then
   raise exception 'Aditivos jurídicos e histórico ausentes.';
 end if;
 if has_table_privilege('anon','public.commercial_contract_addenda','SELECT')
   or has_table_privilege('anon','public.commercial_contract_addendum_events','SELECT')
   or has_table_privilege('authenticated','public.commercial_contract_addendum_events','INSERT')
   or has_table_privilege('authenticated','public.commercial_contract_addendum_events','DELETE') then
   raise exception 'Histórico de aditivos permite operação indevida.';
 end if;
 if not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
  where c.relname='commercial_contract_addenda'
   and t.tgname='commercial_addenda_guard' and not t.tgisinternal) then
   raise exception 'Termo aditivo sem trigger de revisão jurídica.';
 end if;
 if not exists(select 1 from pg_indexes
  where schemaname='public' and indexname='commercial_contract_docs_combined_unique'
   and indexdef like '%addendum_id IS NULL%') then
   raise exception 'Documentos originais e aditivos não estão separados no índice.';
 end if;
 if to_regclass('public.commercial_signature_attempts') is null then
   raise exception 'Tentativas de assinatura comercial não registradas.';
 end if;
 if has_table_privilege('anon','public.commercial_signature_attempts','SELECT')
   or has_table_privilege('authenticated','public.commercial_signature_attempts','INSERT')
   or has_table_privilege('authenticated','public.commercial_signature_attempts','UPDATE')
   or has_table_privilege('authenticated','public.commercial_signature_attempts','DELETE') then
   raise exception 'Tentativas comerciais com privilégios diretos indevidos.';
 end if;
 if has_function_privilege('anon',
    'public.begin_commercial_signature_attempt(uuid,uuid,text,text)','EXECUTE')
   or has_function_privilege('authenticated',
    'public.begin_commercial_signature_attempt(uuid,uuid,text,text)','EXECUTE')
   or not has_function_privilege('service_role',
    'public.begin_commercial_signature_attempt(uuid,uuid,text,text)','EXECUTE') then
   raise exception 'RPC de recuperação exposta a cliente sem autorização.';
 end if;
 if to_regclass('public.commercial_signature_requests') is null or
    to_regclass('public.commercial_signature_invitations') is null then
   raise exception 'Rodadas e convites comerciais não foram criados.';
 end if;
 if has_table_privilege('anon','public.commercial_signature_invitations','SELECT')
    or has_table_privilege('authenticated','public.commercial_signature_invitations','INSERT')
    or has_table_privilege('authenticated','public.commercial_signature_invitations','UPDATE')
    or has_table_privilege('authenticated','public.commercial_signature_requests','UPDATE') then
   raise exception 'Convite comercial exposto para escrita/leitura não autorizada.';
 end if;
 if has_function_privilege('anon','public.create_commercial_signature_request(uuid,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.claim_commercial_signature_turn(text,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.finalize_commercial_signature(text,uuid,text,text,text,text,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.reissue_commercial_signature_invitation(uuid,text,text)','EXECUTE') then
   raise exception 'RPC privilegiada de assinatura comercial indevidamente exposta.';
 end if;
 if not exists(select 1 from pg_policies where schemaname='storage'
    and tablename='objects' and policyname='contract_docs_storage_select_commercial_signed_staff') then
   raise exception 'Evidências finais sem política de leitura restrita.';
 end if;
 if to_regclass('public.commercial_signature_preparations') is null
    or to_regclass('public.commercial_signature_participants') is null then
   raise exception 'Preparação comercial de signatários ausente.';
 end if;
 if has_table_privilege('anon','public.commercial_signature_preparations','SELECT')
    or has_table_privilege('authenticated','public.commercial_signature_preparations','INSERT')
    or has_table_privilege('authenticated','public.commercial_signature_participants','UPDATE')
    or has_table_privilege('authenticated','public.commercial_signature_participants','DELETE') then
   raise exception 'Preparação de signatários com acesso excessivo.';
 end if;
 if has_function_privilege('anon',
      'public.prepare_commercial_signature_participants(uuid,jsonb)','EXECUTE')
    or not has_function_privilege('authenticated',
      'public.prepare_commercial_signature_participants(uuid,jsonb)','EXECUTE') then
   raise exception 'Privilégios de preparação comercial incorretos.';
 end if;
 if not exists(
   select 1 from pg_policies
   where schemaname='public' and tablename='commercial_signature_participants'
     and policyname='commercial_signature_participants_read'
 ) then
   raise exception 'Participantes comerciais sem RLS de leitura.';
 end if;
 if to_regclass('public.commercial_contract_review_events') is null then
   raise exception 'Histórico jurídico imutável ausente.';
 end if;
 if has_table_privilege('authenticated','public.commercial_contract_review_events','INSERT')
    or has_table_privilege('anon','public.commercial_contract_review_events','SELECT') then
   raise exception 'Permissões do histórico jurídico estão excessivas.';
 end if;
 if has_function_privilege('authenticated','public.guard_commercial_legal_approval()','EXECUTE') then
   raise exception 'Função privilegiada de aprovação exposta como RPC.';
 end if;
 if to_regclass('public.commercial_contract_documents') is null then
   raise exception 'Documentos comerciais privados ausentes.';
 end if;
 if has_table_privilege('anon','public.commercial_contract_documents','SELECT') or
    has_table_privilege('authenticated','public.commercial_contract_documents','UPDATE') or
    has_table_privilege('authenticated','public.commercial_contract_documents','DELETE') then
   raise exception 'Registro de evidências comerciais com permissões excessivas.';
 end if;
 if not exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
   where c.relname='commercial_contract_documents'
     and t.tgname='commercial_contract_documents_guard' and not t.tgisinternal) then
   raise exception 'Registro comercial sem guarda de imutabilidade.';
 end if;
 if not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
   where c.relname='commercial_contract_packages'
     and t.tgname='commercial_package_legal_approval_guard' and not t.tgisinternal) then
   raise exception 'Aprovação comercial sem conferência humana protegida.';
 end if;
 if not exists (select 1 from pg_policies
   where schemaname='storage' and tablename='objects'
   and policyname='contract_docs_storage_insert_commercial_reviewer') then
   raise exception 'Storage comercial sem permissão específica controlada.';
 end if;
 if exists (select 1 from storage.buckets
   where id='contract-documents' and public=true) then
   raise exception 'Documentos contratuais estão em bucket público.';
 end if;
end;
$check$;
select 'PASSOU: esquema integral e políticas essenciais' as resultado;

-- Ensaio de segurança só no Supabase descartável: metadata do OTP/signup
-- NUNCA ativa um operador, mesmo se alguém fingir ser "staff_invite".
-- ROLLBACK assegura que nenhum usuário de teste permaneça.
begin;
do $auth_user_regression$
declare
  v_id uuid := gen_random_uuid();
  v_active boolean;
  v_name text;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data
  ) values (
    v_id, '00000000-0000-0000-0000-000000000000',
    'authenticated','authenticated',
    'signup-security-'||v_id::text||'@example.invalid',now(),
    '{"account_purpose":"staff_invite","name":"Teste Externo"}'::jsonb
  );
  select active,name into v_active,v_name
    from public.profiles where id=v_id;
  if not found or v_active is distinct from false
     or v_name is distinct from 'Teste Externo' then
    raise exception 'SEGURANÇA: token/signup criou perfil ativo ou perdeu nome.';
  end if;
  if exists(select 1 from public.staff_memberships where profile_id=v_id) then
    raise exception 'SEGURANÇA: signup criou membership de staff sem convite administrativo.';
  end if;
  -- Mesmo se uma falha futura ativar profiles.active, o cadastro externo
  -- não deve ter permissão sem membership.
  update public.profiles set active=true where id=v_id;
  perform set_config('request.jwt.claim.sub',v_id::text,true);
  if public.is_active_staff() or public.is_active_admin()
    or public.is_active_owner() or public.is_active_admin_or_owner() then
    raise exception 'SEGURANÇA: perfil sem membership acessou o painel.';
  end if;
  -- Somente após a vinculação administrativa de colaborador, este perfil
  -- já confirmado pode executar ações de staff de operador.
  insert into public.staff_memberships(profile_id) values(v_id);
  if not public.is_active_staff() or public.is_active_admin()
     or public.is_active_owner() or public.is_active_admin_or_owner() then
    raise exception 'SEGURANÇA: membership não liberou apenas o operador correto.';
  end if;
end;
$auth_user_regression$;
rollback;
select 'PASSOU: novos signatários/Auth users não ganham acesso staff' as resultado;
