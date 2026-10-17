-- Completa a FK de site_ad_media.client_id -> clients(id), retirada do
-- CREATE TABLE original (20261014000000_site_ad_slots.sql) em 17/10/2026
-- (preparação de publicação) porque site_ad_slots precisa existir ANTES
-- dos 5 arquivos 20261014*/20261015* que fazem ALTER TABLE nele (ordem de
-- nome de arquivo), mas public.clients só existe em
-- 20261014110000_clients.sql — que roda DEPOIS desses 5 arquivos de ALTER
-- (ex.: 20261014015734, às 01:57, é anterior a 20261014110000, às 11:00).
-- Não havia como satisfazer as duas dependências com um único timestamp
-- para o CREATE TABLE; a solução é a FK em separado, aqui, logo após
-- clients existir — site_ad_media.client_id continua opcional (nullable),
-- então nenhuma linha existente pode violar esta constraint.
alter table public.site_ad_media
  add constraint site_ad_media_client_id_fkey
  foreign key (client_id) references public.clients (id);
