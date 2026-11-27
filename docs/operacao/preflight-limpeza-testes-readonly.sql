-- Somente leitura. Não é migration, não autoriza exclusão.
select jsonb_build_object(
 'commercial_sales',(select count(*) from public.commercial_sales),
 'commercial_contract_packages',(select count(*) from public.commercial_contract_packages),
 'commercial_contract_services',(select count(*) from public.commercial_contract_services),
 'institutional_contracts',(select count(*) from public.institutional_contracts),
 'subscriptions',(select count(*) from public.subscriptions),
 'subscription_fingerprint',(select md5(coalesce(string_agg(id::text||':'||client_id::text,',' order by id),'')) from public.subscriptions),
 'receivables',(select count(*) from public.receivables),
 'receivable_fingerprint',(select md5(coalesce(string_agg(id::text||':'||client_id::text,',' order by id),'')) from public.receivables),
 'receipts',(select count(*) from public.receivable_receipts),
 'receipt_fingerprint',(select md5(coalesce(string_agg(id::text||':'||receivable_id::text,',' order by id),'')) from public.receivable_receipts),
 'payment_charges',(select count(*) from public.payment_charges),
 'charge_fingerprint',(select md5(coalesce(string_agg(id::text||':'||receivable_id::text,',' order by id),'')) from public.payment_charges),
 'asaas_references',(select count(*) from public.payment_charges where provider='asaas' and provider_charge_id is not null),
 'adjustments',(select count(*) from public.receivable_adjustments),
 'manual_receivable_operations',(select count(*) from public.manual_receivable_operations),
 'credit_origins',(select count(*) from public.client_credits where origin_receivable_id is not null or origin_receipt_id is not null or origin_payment_charge_id is not null or subscription_id is not null),
 'billing_message_logs_linked',(select count(*) from public.billing_message_logs where receivable_id is not null),
 'billing_notification_dispatches_linked',(select count(*) from public.billing_notification_dispatches where receivable_id is not null or payment_charge_id is not null),
 'linked_interest_requests',(select count(*) from public.site_interest_requests where converted_receivable_id is not null or converted_subscription_id is not null),
 'linked_proposals',(select count(*) from public.commercial_proposals where converted_sale_id is not null),
 'linked_nfse_drafts',(select count(*) from public.nfse_drafts where commercial_sale_id is not null)
) as cleanup_preflight;
