-- Teste em PostgreSQL descartável após o teste de contrato combinado.
-- Fixture reduzida das tabelas comerciais já criadas pela suite de RLS.
create schema if not exists extensions;
alter table public.commercial_sales add column product_id uuid;
grant select,insert,update on public.commercial_sales,public.commercial_products to authenticated;
insert into public.staff_module_action_permissions(profile_id,module_key,action_key,allowed) values
('00000000-0000-0000-0000-000000000002','publicidade','locacao_equipamentos_gerenciar',true),
('00000000-0000-0000-0000-000000000002','publicidade','locacao_reservas_gerenciar',true),
('00000000-0000-0000-0000-000000000002','publicidade','locacao_vistorias_registrar',true);
