-- Otimização sem alteração das permissões: as duas funções de autorização
-- não dependem da matéria e podem ser avaliadas uma vez por consulta.
alter policy articles_select_staff on public.articles
using ((select public.is_active_staff())
  and (select public.staff_can_see_module('editorial')));
