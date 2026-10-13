do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='site_interest_requests'
  ) then
    alter publication supabase_realtime add table public.site_interest_requests;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='admin_notifications'
  ) then
    alter publication supabase_realtime add table public.admin_notifications;
  end if;
end $$;
