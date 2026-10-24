-- Tabela fictícia estritamente para ensaio isolado da seleção de modelos.
-- No Supabase real, contract_templates já existe via migrations anteriores.
-- A suite financeira já possui um stub de contract_templates (id).
-- Completar apenas as colunas necessárias, preservando a RLS do stub.
alter table public.contract_templates
  add column group_id uuid,
  add column version integer,
  add column title text,
  add column category text,
  add column content text,
  add column active boolean not null default true;
create unique index contract_templates_group_version_sandbox
  on public.contract_templates(group_id,version);
grant select on public.contract_templates to authenticated;
insert into public.contract_templates (id,group_id,version,title,category,content,active) values
 ('c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',1,'Contrato de pacote v1','commercial_combined','Cláusulas teste 1',true),
 ('c0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001',2,'Contrato de pacote v2','commercial_combined','Cláusulas teste 2',true),
 ('c0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000003',1,'Modelo institucional','institucional','Licitação teste',true),
 ('c0000000-0000-0000-0000-000000000004','c0000000-0000-0000-0000-000000000004',1,'Locação de equipamentos','commercial_equipment_rental','Locação fictícia',true),
 ('c0000000-0000-0000-0000-000000000005','c0000000-0000-0000-0000-000000000005',1,'Publicidade LED','commercial_led_panel','LED fictício',true),
 ('c0000000-0000-0000-0000-000000000006','c0000000-0000-0000-0000-000000000006',1,'Modelo genérico','commercial_generic','Serviço genérico',true),
 ('c0000000-0000-0000-0000-000000000007','c0000000-0000-0000-0000-000000000007',1,'Modelo desativado','commercial_combined','Inativo',false);
update public.staff_module_visibility set enabled=true where
profile_id='00000000-0000-0000-0000-000000000002' and module_key='publicidade';
