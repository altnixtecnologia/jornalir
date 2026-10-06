-- ==================================================================
-- NFS-e — PARTE 2C: fechar a DPS contra o XSD oficial de Produção
-- Restrita. Novos campos PERMANENTES do prestador exigidos pelo grupo
-- `regTrib` (`TCInfoPrestador`, obrigatório no XSD oficial vigente,
-- ver packages/core/src/nfse/xsd/prodrest-v1.01-20260727/
-- tiposComplexos_v1.01.xsd): situação perante o Simples Nacional
-- (`opSimpNac`) e regime especial de tributação (`regEspTrib`). NÃO
-- aplicada nesta sessão (Supabase bloqueado, HTTP 402) — só escrita/
-- revisada. Incremental: NUNCA altera migrations já commitadas.
-- ==================================================================

alter table public.nfse_issuer_configs
  add column simples_nacional_option text
    check (simples_nacional_option is null or simples_nacional_option in ('non_optant', 'mei', 'me_epp'));

comment on column public.nfse_issuer_configs.simples_nacional_option is
  'Situação do prestador perante o Simples Nacional — mapeia opSimpNac do XSD oficial (TSOpSimpNac: 1=não optante, 2=MEI, 3=ME/EPP). SEMPRE configuração explícita (permanente); NULL bloqueia a transmissão (ver readiness.ts) — nunca um default assumido, nem "não optante".';

alter table public.nfse_issuer_configs
  add column special_tax_regime_code text
    check (special_tax_regime_code is null or special_tax_regime_code in (
      'none', 'cooperative', 'estimated', 'municipal_micro_enterprise',
      'notary_or_registrar', 'autonomous_professional', 'professional_society', 'other'
    ));

comment on column public.nfse_issuer_configs.special_tax_regime_code is
  'Regime especial de tributação do prestador — mapeia regEspTrib do XSD oficial (TSRegEspTrib: 0=Nenhum .. 9=Outros). Campo DISTINTO de special_tax_regime (texto livre, de uso geral, já existente desde a Parte 1) — este é o código fechado exigido pelo grupo regTrib da DPS. SEMPRE configuração explícita; NULL bloqueia a transmissão — mesmo "Nenhum" precisa ser escolhido pelo usuário.';
