-- Etapa 2 (pendências funcionais, 08/11/2026). PREPARADA E VERSIONADA; NÃO
-- aplicada em produção (sem autorização). Somente colunas ADITIVAS e nullable
-- em tabelas existentes — nenhuma estrutura paralela:
--
--  * commercial_proposal_items: `list_unit_price` (preço de TABELA no momento)
--    e `negotiation_reason`. Passa a valer: `unit_price` = valor NEGOCIADO
--    (pode ser menor OU maior que a tabela); `discount_amount` continua
--    sendo só desconto adicional. Itens antigos (list_unit_price nulo) seguem
--    com o significado anterior (unit_price = tabela).
--  * commercial_proposals / commercial_sales: preferências da contratação —
--    modelo escolhido (`contract_template_id`), modalidade e representante
--    legal escolhido (`contractor_representative_id`) — copiadas proposta →
--    venda na conversão e usadas para PRÉ-SELECIONAR o modelo no pacote e para
--    escolher o representante na emissão (validando vigência e poderes). Não
--    alteram o trigger que exige modelo ATIVO na atribuição: modelo em teste
--    nunca vira atribuição de pacote real.
--  * commercial_proposals.composition_request_id: chave de IDEMPOTÊNCIA da
--    montagem de contratação (clique duplo/retry nunca cria 2ª proposta).
--  * Nova ação granular `publicidade.valores_negociar` (CHECK recriada com o
--    catálogo inteiro): exigida pela montagem de contratação quando o valor
--    negociado difere da tabela.

alter table public.commercial_proposal_items
  add column if not exists list_unit_price numeric(12,2) check (list_unit_price is null or list_unit_price >= 0),
  add column if not exists negotiation_reason text check (negotiation_reason is null or char_length(negotiation_reason) <= 500);

alter table public.commercial_proposals
  add column if not exists contract_template_id uuid references public.contract_templates (id) on delete set null,
  add column if not exists contract_modality text check (contract_modality is null or contract_modality in ('commercial', 'institutional')),
  add column if not exists contractor_representative_id uuid references public.company_legal_representatives (id) on delete set null,
  add column if not exists composition_request_id uuid;

create unique index if not exists commercial_proposals_composition_request_id_key
  on public.commercial_proposals (composition_request_id) where composition_request_id is not null;

alter table public.commercial_sales
  add column if not exists contract_template_id uuid references public.contract_templates (id) on delete set null,
  add column if not exists contract_modality text check (contract_modality is null or contract_modality in ('commercial', 'institutional')),
  add column if not exists contractor_representative_id uuid references public.company_legal_representatives (id) on delete set null;

comment on column public.commercial_proposal_items.list_unit_price is
  'Preço de TABELA no momento da montagem (nunca alterado pelo negociado). Nulo em itens anteriores à montagem de contratação (unit_price = tabela).';
comment on column public.commercial_proposals.composition_request_id is
  'Idempotência da montagem de contratação: o mesmo pedido nunca cria duas propostas.';
comment on column public.commercial_sales.contractor_representative_id is
  'Representante legal escolhido para a CONTRATADA; vigência e poderes são revalidados na emissão do documento.';

-- Catálogo de ações: CHECK recriada com TODAS as ações (inclui valores_negociar).
alter table public.staff_module_action_permissions
  drop constraint if exists staff_module_actions_known_pair;

alter table public.staff_module_action_permissions
  add constraint staff_module_actions_known_pair check (
    (module_key = 'editorial' and action_key in ('materias_criar', 'materias_editar', 'materias_publicar', 'materias_arquivar', 'midias_gerenciar', 'edicoes_gerenciar'))
    or (module_key = 'clientes' and action_key in ('clientes_criar', 'clientes_editar'))
    or (module_key = 'assinaturas' and action_key in ('assinaturas_criar', 'assinaturas_editar', 'assinaturas_ativar', 'assinaturas_suspender', 'assinaturas_cancelar'))
    or (module_key = 'publicidade' and action_key in ('produtos_gerenciar', 'solicitacoes_gerenciar', 'propostas_criar', 'propostas_editar', 'propostas_aprovar', 'vendas_criar', 'vendas_editar', 'vendas_cancelar', 'locacao_equipamentos_gerenciar', 'locacao_reservas_gerenciar', 'locacao_vistorias_registrar', 'contratos_preparar', 'contratos_revisar', 'contratos_assinar', 'valores_negociar'))
    or (module_key = 'nfse' and action_key in ('rascunhos_criar', 'rascunhos_editar', 'notas_emitir', 'notas_cancelar', 'configuracoes_gerenciar', 'perfis_servico_gerenciar'))
    or (module_key = 'aniversariantes' and action_key in ('aniversariantes_gerenciar', 'mensagens_gerenciar'))
  );
