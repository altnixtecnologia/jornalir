-- Somente operadores autorizados a gerenciar EDICOES alteram o acervo.
-- A leitura pública de edições ativas continua com as policies anteriores.
drop policy if exists newspaper_editions_insert_staff on public.newspaper_editions;
create policy newspaper_editions_insert_staff on public.newspaper_editions
for insert to authenticated
with check (public.is_active_staff() and public.staff_can_module_action('editorial','edicoes_gerenciar'));
drop policy if exists newspaper_editions_update_staff on public.newspaper_editions;
create policy newspaper_editions_update_staff on public.newspaper_editions
for update to authenticated
using (public.is_active_staff() and public.staff_can_module_action('editorial','edicoes_gerenciar'))
with check (public.is_active_staff() and public.staff_can_module_action('editorial','edicoes_gerenciar'));
