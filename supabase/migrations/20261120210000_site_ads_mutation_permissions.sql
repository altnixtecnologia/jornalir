-- Somente editores comerciais autorizados (ou owner/admin, via RPC)
-- podem modificar a grade de patrocinadores do portal. Leitura pública
-- continua somente nas views public_site_ad_* preexistentes.
drop policy if exists site_ad_slots_update_staff on public.site_ad_slots;
create policy site_ad_slots_update_staff on public.site_ad_slots
 for update to authenticated
 using (public.is_active_staff() and public.staff_can_module_action('publicidade','vendas_editar'))
 with check (public.is_active_staff() and public.staff_can_module_action('publicidade','vendas_editar'));

drop policy if exists site_ad_media_insert_staff on public.site_ad_media;
create policy site_ad_media_insert_staff on public.site_ad_media
 for insert to authenticated
 with check (public.is_active_staff() and public.staff_can_module_action('publicidade','vendas_editar'));

drop policy if exists site_ad_media_update_staff on public.site_ad_media;
create policy site_ad_media_update_staff on public.site_ad_media
 for update to authenticated
 using (public.is_active_staff() and public.staff_can_module_action('publicidade','vendas_editar'))
 with check (public.is_active_staff() and public.staff_can_module_action('publicidade','vendas_editar'));

drop policy if exists site_ad_media_delete_staff on public.site_ad_media;
create policy site_ad_media_delete_staff on public.site_ad_media
 for delete to authenticated
 using (public.is_active_staff() and public.staff_can_module_action('publicidade','vendas_editar'));
