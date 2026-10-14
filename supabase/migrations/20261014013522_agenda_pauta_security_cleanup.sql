-- Consolida a leitura de profiles em uma única policy para evitar
-- múltiplas policies permissivas no mesmo SELECT.
drop policy if exists profiles_select_active_staff_directory on public.profiles;
drop policy if exists profiles_select_own_or_admin_owner on public.profiles;

create policy profiles_select_own_admin_or_staff_directory
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_active_admin_or_owner())
    or ((select public.is_active_staff()) and active = true)
  );

-- Funções de trigger não devem ser chamadas diretamente via RPC.
revoke all on function public.set_agenda_event_actor() from public, anon, authenticated;
revoke all on function public.set_weekly_pauta_actor() from public, anon, authenticated;

-- Privilégios mínimos nas tabelas novas. RLS continua sendo a camada
-- principal de autorização por usuário.
revoke all on table public.agenda_events from anon;
revoke all on table public.agenda_event_assignees from anon;
revoke all on table public.weekly_pauta_items from anon;

revoke all on table public.agenda_events from authenticated;
grant select, insert, update on table public.agenda_events to authenticated;

revoke all on table public.agenda_event_assignees from authenticated;
grant select, insert, update, delete on table public.agenda_event_assignees to authenticated;

revoke all on table public.weekly_pauta_items from authenticated;
grant select, insert, update on table public.weekly_pauta_items to authenticated;
