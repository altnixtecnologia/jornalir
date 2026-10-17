-- NOVA em 17/10/2026 (preparação de publicação, reconciliação de
-- histórico). Executa o backfill que já existe (protegido por guarda) em
-- 20261014020555_site_interest_attendance_and_route.sql — aquele arquivo
-- já está aplicado no remoto sob este nome exato, mas os 2 primeiros
-- UPDATEs leem converted_subscription_id/converted_receivable_id/
-- converted_client_id, que só passam a existir de verdade a partir de
-- 20261029100010_site_interest_conversion_links.sql (aplicada
-- imediatamente antes desta).
update public.site_interest_requests r
set converted_subscription_id = coalesce(
      r.converted_subscription_id,
      (
        select s.id
        from public.subscriptions s
        where s.notes ilike '%' || '[site-interest:' || r.id::text || ']' || '%'
        order by s.created_at asc
        limit 1
      )
    ),
    converted_receivable_id = coalesce(
      r.converted_receivable_id,
      (
        select rec.id
        from public.receivables rec
        where rec.notes ilike '%' || '[site-interest:' || r.id::text || ']' || '%'
        order by rec.created_at asc
        limit 1
      )
    )
where r.status = 'converted';

update public.site_interest_requests r
set converted_client_id = coalesce(
      r.converted_client_id,
      (
        select s.client_id
        from public.subscriptions s
        where s.id = r.converted_subscription_id
        limit 1
      )
    ),
    converted_at = coalesce(r.converted_at, r.reviewed_at, r.updated_at),
    attended_at = coalesce(r.attended_at, r.converted_at, r.reviewed_at, r.updated_at),
    attended_by = coalesce(r.attended_by, r.reviewed_by)
where r.status = 'converted';
