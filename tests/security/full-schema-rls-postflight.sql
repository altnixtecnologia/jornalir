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

 if not exists (select 1 from pg_trigger t join pg_class c on t.tgrelid=c.oid
     where c.relname='nfse_drafts' and t.tgname='nfse_drafts_guard_operator_fields'
     and not t.tgisinternal) then
   raise exception 'Falta proteção do rascunho fiscal.';
 end if;
end;
$check$;
select 'PASSOU: esquema integral e políticas essenciais' as resultado;
