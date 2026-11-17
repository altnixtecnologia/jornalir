-- A ordenação agora usa índice em articles; a view intermediária não é necessária.
drop view if exists public.articles_admin_edition_order;
