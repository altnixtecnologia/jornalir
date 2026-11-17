-- A mesma otimização de leitura para edição, galeria e destaques.
-- Nenhum privilégio ou operação de escrita é concedido.
alter policy article_media_select_staff on public.article_media
using ((select public.is_active_staff())
  and (select public.staff_can_see_module('editorial')));
alter policy article_placements_select_staff on public.article_placements
using ((select public.is_active_staff())
  and (select public.staff_can_see_module('editorial')));
alter policy newspaper_editions_select_staff on public.newspaper_editions
using ((select public.is_active_staff())
  and (select public.staff_can_see_module('editorial')));
