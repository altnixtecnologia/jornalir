-- Cadastro mestre: adequação CNPJ alfanumérico (Receita Federal, julho/2026)
-- e ordenação confiável da lista. NÃO mexe em dados de aniversariantes,
-- ID de clientes, CPF, contratos, cobranças, assinaturas ou integrações remotas.
--
-- O CNPJ continua com 14 caracteres, posições 1-12 A-Z/0-9 e DV 13-14 0-9.
-- A aplicação valida o DV com módulo 11/ASCII-48 e grava o dado em maiúsculas.
-- CNPJs numéricos antigos permanecem exatamente como estão e continuam válidos.
alter table public.clients
 drop constraint clients_cnpj_digits;
alter table public.clients
 add constraint clients_cnpj_format
 check (cnpj is null or cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$');

comment on column public.clients.cnpj is
 'CNPJ canônico (14 caracteres sem pontuação); numérico histórico ou alfanumérico 2026, 12 posições A-Z/0-9 e 2 DVs numéricos. Unicidade preservada por clients_cnpj_unique.';

-- Colunas calculadas exclusivamente para paginação/ordenação no servidor;
-- não alteram o nome de exibição ou identidade do cadastro.
alter table public.clients
 add column display_sort_name text generated always as
   (lower(coalesce(nullif(case when kind='company'
     then coalesce(nullif(trade_name,''),company_name)
     else full_name end,''),''))) stored,
 add column document_sort_key text generated always as
   (coalesce(cpf,cnpj,'')) stored;

create index clients_display_sort_name_idx on public.clients(display_sort_name,id);
create index clients_document_sort_key_idx on public.clients(document_sort_key,id);

comment on column public.clients.display_sort_name is
 'Ordenação estável da listagem de clientes por nome usado na interface; derivado, não editável.';
comment on column public.clients.document_sort_key is
 'Ordenação de CPF/CNPJ; derivado, não editável.';

-- As colunas fiscais fiscais_email, municipal_registration, address_ibge_code
-- e icms_status já existem. Não criar outras versões desses campos.
-- NÃO implementar dados de IBS/CBS no cadastro: dependem do serviço,
-- documento fiscal e competência e pertencem ao módulo fiscal desativado.
