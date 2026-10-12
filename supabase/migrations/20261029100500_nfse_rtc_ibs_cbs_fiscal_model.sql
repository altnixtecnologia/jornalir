-- NFS-e — atualização da modelagem fiscal pra Reforma Tributária do
-- Consumo / IBS-CBS (NT SE/CGNFS-e 009 v1.01, Anexo VI IBS/CBS v1.04.01,
-- Anexo VII cIndOp v1.03.00 — vigente out/2026). NÃO aplicada ainda
-- (local apenas, ver relatório da tarefa). Só os campos PERSISTENTES
-- necessários — nenhuma alíquota (pIBSUF/pIBSMun/pCBS/pIBSSN/pCBSSN) ou
-- valor calculado (vIBS/vCBS/vReceitaBrutaSN) é cadastrado aqui: esses
-- vêm sempre de cálculo/regra fiscal, nunca de configuração permanente.
--
-- Domínios usados abaixo são só os CONFIRMADOS nesta revisão (opSimpNac
-- com 4ª opção, regApIBSCBSSN, cAtvSN) — CONFIRMADOS de verdade contra
-- a planilha oficial do Anexo VI (extraída diretamente do .xlsx do
-- portal gov.br/nfse, ver relatório da tarefa) — CST IBS/CBS e
-- cClassTrib ficam texto livre de propósito (domínio ainda não
-- localizado nas fontes oficiais consultadas, nunca um enum inventado).

-- ==================================================================
-- 1) CONFIGURAÇÃO DO PRESTADOR (nfse_issuer_configs)
-- ==================================================================

-- 1a) opSimpNac — adiciona a 4ª opção (Optante Pendente). Repara o
-- check existente (igual ao padrão já usado em 20261027100000_payment_method_expanded.sql:
-- drop do check auto-nomeado + create de um named).
alter table public.nfse_issuer_configs
  drop constraint if exists nfse_issuer_configs_simples_nacional_option_check;

alter table public.nfse_issuer_configs
  add constraint nfse_issuer_configs_simples_nacional_option_values
    check (simples_nacional_option is null or simples_nacional_option in ('non_optant', 'mei', 'me_epp', 'pending_optant'));

comment on column public.nfse_issuer_configs.simples_nacional_option is
  'opSimpNac do XSD oficial — 1=não optante, 2=MEI, 3=ME/EPP, 4=Optante Pendente (opção nova da revisão RTC/IBS-CBS, NT009 v1.01). SEMPRE configuração explícita; NULL bloqueia a transmissão.';

-- 1b) regApIBSCBSSN — NOVO. Só aplicável/exigido quando optante
-- (MEI/ME-EPP/Pendente) — ver isIbsCbsSimplesRegimeApplicable em
-- @ir/types e a verificação condicional em readiness.ts.
alter table public.nfse_issuer_configs
  add column ibs_cbs_simples_nacional_regime text
    check (ibs_cbs_simples_nacional_regime is null or ibs_cbs_simples_nacional_regime in ('simples_both', 'simples_cbs_only', 'regular_both'));

comment on column public.nfse_issuer_configs.ibs_cbs_simples_nacional_regime is
  'regApIBSCBSSN (Anexo VI IBS/CBS v1.04.01) — 1=IBS e CBS pelo Simples Nacional, 2=CBS pelo Simples/IBS pelo regime regular, 3=IBS e CBS pelo regime regular. Só aplicável quando simples_nacional_option for MEI/ME-EPP/Pendente; nunca um default silencioso.';

-- 1c) Regime tributário administrativo — select fechado substituindo o
-- texto livre tax_regime (nunca usado isoladamente pra gerar código
-- fiscal, só exibição). tax_regime (coluna antiga) fica DEPRECADA:
-- preservada no banco por segurança (dado histórico eventual nunca
-- descartado), mas a aplicação para de ler/escrever nela a partir de
-- agora — administrative_tax_regime é o campo atual.
alter table public.nfse_issuer_configs
  add column administrative_tax_regime text
    check (administrative_tax_regime is null or administrative_tax_regime in ('simples_nacional', 'lucro_presumido', 'lucro_real', 'other'));

comment on column public.nfse_issuer_configs.administrative_tax_regime is
  'Regime tributário administrativo/descritivo (select fechado) — NUNCA usado isoladamente pra gerar código fiscal da DPS (isso é sempre simples_nacional_option/special_tax_regime_code). Substitui tax_regime (texto livre, deprecado abaixo).';

comment on column public.nfse_issuer_configs.tax_regime is
  'DEPRECADA (revisão RTC/IBS-CBS) — a aplicação não lê/escreve mais esta coluna; usar administrative_tax_regime. Preservada só por segurança de dado histórico eventual, nunca apagada.';

-- 1d) special_tax_regime (texto livre) — mesma situação: a aplicação
-- parou de ler/escrever (eliminação da duplicidade com
-- special_tax_regime_code, já o campo oficial exigido pelo XSD desde
-- 20261024100000). Preservada no banco, nunca apagada.
comment on column public.nfse_issuer_configs.special_tax_regime is
  'DEPRECADA (revisão RTC/IBS-CBS) — a aplicação não lê/escreve mais esta coluna, de propósito (eliminava duplicidade com special_tax_regime_code, o campo oficial exigido pelo XSD). Preservada só por segurança de dado histórico eventual, nunca apagada.';

-- 1e) Inscrição Estadual — dado cadastral/fiscal do prestador, OPCIONAL
-- (nem todo prestador de serviço tem IE). Só persistida como dado
-- cadastral; NUNCA incluída automaticamente no XML/DPS sem confirmação
-- de que o leiaute oficial vigente usa este campo nesse grupo (não
-- confirmado nesta revisão — ver relatório da tarefa).
alter table public.nfse_issuer_configs
  add column state_registration text;

comment on column public.nfse_issuer_configs.state_registration is
  'Inscrição Estadual do prestador — dado cadastral/fiscal opcional. NUNCA incluída automaticamente no XML/DPS (dps-builder.ts) sem confirmação de que o leiaute oficial vigente a exige nesse grupo — por ora só armazenamento cadastral.';

-- ==================================================================
-- 2) PERFIL DE SERVIÇO (nfse_service_profiles) — campos que variam
-- por atividade/operação, nunca pelo prestador como um todo.
-- ==================================================================

alter table public.nfse_service_profiles
  add column c_atv_sn text
    check (c_atv_sn is null or c_atv_sn in ('07', '08', '09', '10', '11', '12', '13', '14', '90')),
  add column cst_ibs_cbs text,
  add column c_class_trib text,
  add column c_ind_op text;

comment on column public.nfse_service_profiles.c_atv_sn is
  'Código de atividade do Simples Nacional — domínio oficial fechado CONFIRMADO diretamente no Anexo VI IBS/CBS v1.04.01 (NT009 v1.01), campo de 2 dígitos (07,08,09,10,11,12,13,14,90 — nunca 1 dígito). Ver NFSE_CATVSN_LABELS em @ir/types pro texto oficial de cada código.';
comment on column public.nfse_service_profiles.cst_ibs_cbs is
  'CST (Código de Situação Tributária) de IBS/CBS — domínio localizado só como rótulo de campo no Anexo VI (sem a tabela de códigos em si); permanece texto livre de propósito até confirmação completa, nunca um enum com valores presumidos.';
comment on column public.nfse_service_profiles.c_class_trib is
  'cClassTrib (classificação tributária IBS/CBS) — confirmado que os 3 primeiros dígitos devem ser iguais ao CST (regra de negócio localizada no Anexo VI), mas a tabela completa de valores não foi localizada nas fontes consultadas; permanece texto livre de propósito.';
comment on column public.nfse_service_profiles.c_ind_op is
  'cIndOp — domínio LOCALIZADO e extenso no Anexo VII cIndOp v1.03.00 (códigos de 6 dígitos, ex.: 010101, com tipo de operação/local de incidência/base legal por código), mas NÃO modelado nesta migration por ser uma tabela grande e multi-atributo que merece modelagem própria (ver relatório da tarefa); permanece texto livre de propósito por ora. Valor PADRÃO do perfil, ajustável por operação no rascunho (ver nfse_drafts.fiscal_c_ind_op).';

-- ==================================================================
-- 3) RASCUNHO (nfse_drafts) — snapshot fiscal. Os 3 campos issuer_*
-- são copiados da CONFIGURAÇÃO DO PRESTADOR no momento da criação
-- (mesmo princípio do snapshot do tomador: nunca refletem mudança
-- posterior na configuração do prestador); os 4 campos fiscal_c_* são
-- copiados do PERFIL DE SERVIÇO, ajustáveis só nesta linha sem alterar
-- o perfil mestre.
-- ==================================================================

alter table public.nfse_drafts
  add column fiscal_c_atv_sn text
    check (fiscal_c_atv_sn is null or fiscal_c_atv_sn in ('07', '08', '09', '10', '11', '12', '13', '14', '90')),
  add column fiscal_cst_ibs_cbs text,
  add column fiscal_c_class_trib text,
  add column fiscal_c_ind_op text,
  add column fiscal_issuer_simples_nacional_option text
    check (fiscal_issuer_simples_nacional_option is null or fiscal_issuer_simples_nacional_option in ('non_optant', 'mei', 'me_epp', 'pending_optant')),
  add column fiscal_issuer_ibs_cbs_simples_nacional_regime text
    check (fiscal_issuer_ibs_cbs_simples_nacional_regime is null or fiscal_issuer_ibs_cbs_simples_nacional_regime in ('simples_both', 'simples_cbs_only', 'regular_both')),
  add column fiscal_issuer_special_tax_regime_code text
    check (fiscal_issuer_special_tax_regime_code is null or fiscal_issuer_special_tax_regime_code in (
      'none', 'cooperative', 'estimated', 'municipal_micro_enterprise',
      'notary_or_registrar', 'autonomous_professional', 'professional_society', 'other'
    ));

comment on column public.nfse_drafts.fiscal_c_atv_sn is
  'Copiado do perfil de serviço na criação do rascunho — ajustável por operação sem alterar o perfil mestre.';
comment on column public.nfse_drafts.fiscal_issuer_simples_nacional_option is
  'Snapshot de nfse_issuer_configs.simples_nacional_option no momento da criação do rascunho — nunca editável diretamente aqui, nunca reflete mudança posterior na configuração do prestador.';
comment on column public.nfse_drafts.fiscal_issuer_ibs_cbs_simples_nacional_regime is
  'Snapshot de nfse_issuer_configs.ibs_cbs_simples_nacional_regime no momento da criação do rascunho.';
comment on column public.nfse_drafts.fiscal_issuer_special_tax_regime_code is
  'Snapshot de nfse_issuer_configs.special_tax_regime_code no momento da criação do rascunho.';

-- ==================================================================
-- NÃO incluído nesta migration (propositalmente — ver relatório,
-- item 6): indFinal, local de incidência IBS/CBS, ajustes de base.
-- Nenhuma operação comum do Jornal IR precisa desses campos agora;
-- quando precisar, uma migration própria os adiciona então, nunca
-- campos especulativos criados "pra garantir".
-- ==================================================================
