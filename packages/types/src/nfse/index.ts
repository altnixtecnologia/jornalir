// Módulo NFS-e (Parte 1 — base, configurações fiscais, perfis de
// serviço e rascunhos). Independente de Contratos/Assinaturas/
// Financeiro — ver docs/NFSE-NACIONAL-ARQUITETURA.md. NÃO implementa
// transmissão real, assinatura digital, XML/DPS definitivo, Asaas,
// Pix, WhatsApp ou IBS/CBS; só a base de domínio (configuração do
// prestador, perfis de serviço, rascunhos com snapshot). Nenhum
// código/parâmetro fiscal é inventado aqui — cTribNac/cTribMun/cNBS
// são sempre texto livre informado pelo usuário, nunca um enum
// hardcoded com valores presumidos.

import type { Client, ClientKind } from "../clientes";

// --- Configuração fiscal do emissor -------------------------------------

export type NfseEnvironment = "homologation" | "production";
export const NFSE_ENVIRONMENTS: readonly NfseEnvironment[] = ["homologation", "production"];
export const NFSE_ENVIRONMENT_LABELS: Record<NfseEnvironment, string> = {
  homologation: "Produção Restrita",
  production: "Produção",
};

/** Metadata do certificado digital — NUNCA o arquivo/senha/chave
 * privada (ver comentário no provider Supabase e na migration).
 * "configured" aqui significa só "referência configurada", nunca que
 * o certificado foi validado contra o Sistema Nacional. */
export type NfseCertificateType = "a1" | "a3" | "not_configured";
export const NFSE_CERTIFICATE_TYPES: readonly NfseCertificateType[] = ["a1", "a3", "not_configured"];
export const NFSE_CERTIFICATE_TYPE_LABELS: Record<NfseCertificateType, string> = {
  a1: "A1",
  a3: "A3",
  not_configured: "Não definido",
};

/** Estado PERSISTIDO do certificado — "expired" NUNCA é gravado, é
 * sempre derivado (ver computeCertificateEffectiveStatus), mesmo
 * princípio de computeReceivableDueFlag/computeContractVigencyFlag. */
export type NfseCertificateStoredStatus = "not_configured" | "configured";
export const NFSE_CERTIFICATE_STORED_STATUSES: readonly NfseCertificateStoredStatus[] = ["not_configured", "configured"];

export type NfseCertificateEffectiveStatus = "not_configured" | "configured" | "expired";
export const NFSE_CERTIFICATE_EFFECTIVE_STATUS_LABELS: Record<NfseCertificateEffectiveStatus, string> = {
  not_configured: "Não configurado",
  configured: "Configurado",
  expired: "Expirado",
};

export function computeCertificateEffectiveStatus(
  status: NfseCertificateStoredStatus,
  validUntil: string | undefined,
  today: Date = new Date(),
): NfseCertificateEffectiveStatus {
  if (status === "not_configured") return "not_configured";
  if (!validUntil) return "configured";
  const reference = new Date(today);
  reference.setHours(0, 0, 0, 0);
  return new Date(`${validUntil}T00:00:00`) < reference ? "expired" : "configured";
}

/**
 * Situação do prestador perante o Simples Nacional (Parte 2C, atualizado
 * na revisão RTC/IBS-CBS — NT SE/CGNFS-e 009 v1.01, outubro/2026) —
 * mapeia diretamente `opSimpNac` do XSD oficial: "1"=não optante,
 * "2"=MEI, "3"=ME/EPP, "4"=Optante Pendente (opção nova desta revisão).
 * SEMPRE configuração explícita do prestador (permanente, não muda
 * por emissão) — `undefined` bloqueia a transmissão (ver readiness.ts).
 * NUNCA um default assumido: mesmo "não optante" precisa ser escolhido.
 */
export type NfseSimplesNacionalOption = "non_optant" | "mei" | "me_epp" | "pending_optant";
export const NFSE_SIMPLES_NACIONAL_OPTIONS: readonly NfseSimplesNacionalOption[] = ["non_optant", "mei", "me_epp", "pending_optant"];
export const NFSE_SIMPLES_NACIONAL_OPTION_LABELS: Record<NfseSimplesNacionalOption, string> = {
  non_optant: "Não optante do Simples Nacional",
  mei: "Optante — MEI (Microempreendedor Individual)",
  me_epp: "Optante — ME/EPP (Microempresa ou Empresa de Pequeno Porte)",
  pending_optant: "Optante Pendente",
};
export const NFSE_SIMPLES_NACIONAL_OPTION_CODES: Record<NfseSimplesNacionalOption, "1" | "2" | "3" | "4"> = {
  non_optant: "1",
  mei: "2",
  me_epp: "3",
  pending_optant: "4",
};

/**
 * Regime de apuração de IBS/CBS no Simples Nacional — `regApIBSCBSSN`
 * (Anexo VI IBS/CBS v1.04.01, NT009 v1.01). Só faz sentido/é exigido
 * quando `simplesNacionalOption` é MEI, ME/EPP ou Optante Pendente
 * (nunca para não optante) — ver readiness.ts. NUNCA um default
 * silencioso: mesmo quando aplicável, o usuário escolhe explicitamente.
 */
export type NfseIbsCbsSimplesNacionalRegime = "simples_both" | "simples_cbs_only" | "regular_both";
export const NFSE_IBS_CBS_SIMPLES_NACIONAL_REGIMES: readonly NfseIbsCbsSimplesNacionalRegime[] = [
  "simples_both",
  "simples_cbs_only",
  "regular_both",
];
export const NFSE_IBS_CBS_SIMPLES_NACIONAL_REGIME_LABELS: Record<NfseIbsCbsSimplesNacionalRegime, string> = {
  simples_both: "IBS e CBS apurados pelo Simples Nacional",
  simples_cbs_only: "CBS pelo Simples Nacional e IBS pelo regime regular",
  regular_both: "IBS e CBS pelo regime regular",
};
export const NFSE_IBS_CBS_SIMPLES_NACIONAL_REGIME_CODES: Record<NfseIbsCbsSimplesNacionalRegime, "1" | "2" | "3"> = {
  simples_both: "1",
  simples_cbs_only: "2",
  regular_both: "3",
};

/** `regApIBSCBSSN` só é exigido quando o prestador é optante (MEI/ME-EPP/Pendente) — nunca para não optante. Única fonte desta regra (nunca duplicar em outro ponto). */
export function isIbsCbsSimplesRegimeApplicable(option: NfseSimplesNacionalOption | undefined): boolean {
  return option === "mei" || option === "me_epp" || option === "pending_optant";
}

/**
 * Regime tributário — campo administrativo/descritivo (ex.: exibição em
 * relatórios internos), NUNCA usado isoladamente para gerar o código
 * fiscal da DPS. O campo fiscal de verdade continua sendo sempre
 * `simplesNacionalOption`/`specialTaxRegimeCode` (os campos oficiais do
 * XSD). Antes era texto livre; passou a ser um select fechado só pra
 * padronizar a exibição administrativa.
 */
export type NfseAdministrativeTaxRegime = "simples_nacional" | "lucro_presumido" | "lucro_real" | "other";
export const NFSE_ADMINISTRATIVE_TAX_REGIMES: readonly NfseAdministrativeTaxRegime[] = [
  "simples_nacional",
  "lucro_presumido",
  "lucro_real",
  "other",
];
export const NFSE_ADMINISTRATIVE_TAX_REGIME_LABELS: Record<NfseAdministrativeTaxRegime, string> = {
  simples_nacional: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
  other: "Outro",
};

/**
 * Regime especial de tributação do prestador (Parte 2C) — mapeia
 * `regEspTrib` do XSD oficial (`TSRegEspTrib`). SEMPRE configuração
 * explícita — "none" (Nenhum) também precisa ser escolhido pelo
 * usuário, nunca é um default silencioso.
 */
export type NfseSpecialTaxRegimeCode =
  | "none"
  | "cooperative"
  | "estimated"
  | "municipal_micro_enterprise"
  | "notary_or_registrar"
  | "autonomous_professional"
  | "professional_society"
  | "other";
export const NFSE_SPECIAL_TAX_REGIME_CODES: readonly NfseSpecialTaxRegimeCode[] = [
  "none",
  "cooperative",
  "estimated",
  "municipal_micro_enterprise",
  "notary_or_registrar",
  "autonomous_professional",
  "professional_society",
  "other",
];
export const NFSE_SPECIAL_TAX_REGIME_CODE_LABELS: Record<NfseSpecialTaxRegimeCode, string> = {
  none: "Nenhum",
  cooperative: "Ato Cooperado (Cooperativa)",
  estimated: "Estimativa",
  municipal_micro_enterprise: "Microempresa Municipal",
  notary_or_registrar: "Notário ou Registrador",
  autonomous_professional: "Profissional Autônomo",
  professional_society: "Sociedade de Profissionais",
  other: "Outros",
};
export const NFSE_SPECIAL_TAX_REGIME_CODE_XSD_VALUES: Record<NfseSpecialTaxRegimeCode, "0" | "1" | "2" | "3" | "4" | "5" | "6" | "9"> = {
  none: "0",
  cooperative: "1",
  estimated: "2",
  municipal_micro_enterprise: "3",
  notary_or_registrar: "4",
  autonomous_professional: "5",
  professional_society: "6",
  other: "9",
};

/**
 * Configuração fiscal permanente do prestador (item 4) — uma única
 * configuração ativa por vez (o provider sempre trabalha com a mais
 * recente). Dados iniciais da Informativo Regional LTDA podem ser
 * sugeridos como valor inicial, nunca como constante fiscal imutável
 * — o usuário sempre pode editar.
 */
export interface NfseIssuerConfig {
  id: string;
  companyName: string;
  tradeName?: string;
  cnpj: string;
  municipalRegistration: string;
  /** Opcional — nem todo prestador de serviço tem IE. Dado cadastral/fiscal só armazenado; NUNCA incluído automaticamente no XML/DPS sem confirmação de que o leiaute oficial vigente usa este campo. */
  stateRegistration?: string;
  municipality: string;
  state: string;
  ibgeCode: string;
  /**
   * Regime tributário geral — administrativo/descritivo (ver
   * NfseAdministrativeTaxRegime), nunca usado isoladamente para gerar
   * código fiscal da DPS. Era texto livre; passou a ser select fechado
   * na revisão RTC/IBS-CBS (NT009 v1.01) — "taxRegime" (texto livre)
   * removido de propósito: eliminava a duplicidade de ter um campo
   * livre E um campo oficial para a mesma ideia geral.
   */
  administrativeTaxRegime?: NfseAdministrativeTaxRegime;
  /** `opSimpNac` do XSD oficial (grupo `regTrib`, obrigatório pra transmitir — ver readiness.ts). Nunca presumido a partir de `administrativeTaxRegime`. */
  simplesNacionalOption?: NfseSimplesNacionalOption;
  /**
   * `regEspTrib` do XSD oficial (grupo `regTrib`, obrigatório pra
   * transmitir) — ÚNICO campo de regime especial do prestador na
   * revisão RTC/IBS-CBS. O antigo `specialTaxRegime` (texto livre,
   * duplicava a mesma informação) foi removido de propósito — eliminar
   * essa duplicidade era um requisito explícito desta revisão.
   */
  specialTaxRegimeCode?: NfseSpecialTaxRegimeCode;
  /**
   * `regApIBSCBSSN` (Anexo VI IBS/CBS v1.04.01) — NOVO na revisão RTC/
   * IBS-CBS. Só aplicável/exigido quando `simplesNacionalOption` for
   * MEI, ME/EPP ou Optante Pendente (ver isIbsCbsSimplesRegimeApplicable
   * — nunca para não optante). Nunca um default silencioso: mesmo
   * quando aplicável, exige escolha explícita (ver readiness.ts).
   */
  ibsCbsSimplesNacionalRegime?: NfseIbsCbsSimplesNacionalRegime;
  environment: NfseEnvironment;
  certificateType: NfseCertificateType;
  certificateStatus: NfseCertificateStoredStatus;
  certificateValidUntil?: string;
  /** Referência segura futura (nunca o arquivo/senha) — ex.: um identificador de onde o certificado está guardado num cofre externo. */
  certificateReference?: string;
  /** Série da DPS usada nas transmissões (Parte 2A, item 5) — SEMPRE configurada explicitamente, nunca um valor fictício. `undefined` bloqueia a transmissão (ver validação em DraftService/TransmissionService). */
  dpsSeries?: string;
  notes?: string;
  createdByProfileId?: string;
  updatedByProfileId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * AJUSTE (Parte 2B): o campo `signatureAlgorithm` (escolha manual
 * SHA1/SHA256) da Parte 2A foi REMOVIDO. A incerteza que o motivou foi
 * resolvida: há fonte oficial do Portal Nacional confirmando o perfil
 * de assinatura da DPS (RSA-SHA1/SHA1/C14N 1.0/enveloped — ver
 * `NFSE_DPS_SIGNATURE_PROFILE` em `signature.ts`, @ir/core). Não é mais
 * uma escolha do usuário; o perfil é fixo e só muda se uma nota técnica
 * oficial futura alterar a regra (nesse caso, só `signature.ts` muda).
 */

/**
 * Metadata do certificado digital A1 efetivamente validado e
 * armazenado de forma criptografada (Parte 2B) — NUNCA o PFX/senha/
 * chave privada em texto puro; isso fica só no cofre criptografado
 * (ver `nfse_certificates`/secret-store em @ir/core). Esta metadata é
 * segura de expor à UI (nenhum campo aqui é segredo).
 */
export interface NfseCertificateInfo {
  id: string;
  /** CNPJ extraído do certificado, só os dígitos — usado para confirmar que corresponde ao CNPJ configurado do prestador. */
  subjectCnpj?: string;
  subjectName?: string;
  issuerName?: string;
  serialNumber: string;
  /** SHA-256 do certificado público, seguro para identificação visual. */
  fingerprint: string;
  validFrom: string;
  validUntil: string;
  active: boolean;
  createdAt: string;
}

/**
 * Pacote de esquemas XSD vigente pra PRODUÇÃO RESTRITA (Parte 2A, item
 * 4) — "NFSe-ESQUEMAS_XSD-PRODREST-v1.01-20260727", confirmado
 * diretamente pelo usuário/fonte oficial. Produção tem um pacote
 * PRÓPRIO e diferente, que nunca deve ser misturado com este — ainda
 * não precisamos do valor exato porque a transmissão em produção
 * continua bloqueada nesta fase (ver isTransmissionEnvironmentAllowed).
 */
/** Versão EFETIVAMENTE vendorizada/testada no repositório — jamais atualizar sem trocar os XSD.
 * Tipada como `string` (não literal): as duas constantes devem poder convergir sem o
 * TypeScript marcar a comparação em checkHomologationReadiness() como "sem overlap" —
 * o fail-closed é uma checagem de RUNTIME deliberada, válida tanto divergindo quanto convergindo. */
export const NFSE_SCHEMA_PACKAGE_HOMOLOGATION: string = "NFSe-ESQUEMAS_XSD-PRODREST-v1.01-20261020";
/** Versão vigente informada pelo Portal NFS-e para Produção Restrita em 20/10/2026.
 * É deliberadamente distinta da versão vendorizada; a divergência bloqueia a prontidão.
 * Fonte: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita */
export const NFSE_SCHEMA_PACKAGE_REQUIRED_HOMOLOGATION: string = "NFSe-ESQUEMAS_XSD-PRODREST-v1.01-20261020";

/**
 * PENDENTE (revisão RTC/IBS-CBS, outubro/2026): a Reforma Tributária do
 * Consumo alterou o leiaute da NFS-e Nacional (NT SE/CGNFS-e 009 v1.01 +
 * Anexo VI IBS/CBS v1.04.01 + Anexo VII cIndOp v1.03.00) a partir de
 * 01/10/2026 — o pacote XSD vendorizado acima
 * (`xsd/prodrest-v1.01-20260727/`) é ANTERIOR a essa atualização e NÃO
 * inclui os grupos IBS/CBS. Esta constante continua apontando pro
 * pacote antigo de propósito: não temos ainda o pacote XSD oficial
 * revisado vendorizado neste projeto (precisa ser obtido da fonte
 * oficial e conferido antes de qualquer alteração aqui — nunca
 * reconstruído de memória). `validateDpsAgainstOfficialXsd` continua
 * validando contra o pacote antigo; o builder (dps-builder.ts) continua
 * SEM emitir nenhum elemento IBS/CBS até o pacote revisado existir de
 * fato neste repositório.
 */

/** Valores sugeridos pra primeira configuração — nunca aplicados automaticamente, só usados como `defaultValue` num formulário que o usuário ainda precisa salvar explicitamente. */
export const NFSE_SUGGESTED_ISSUER_DEFAULTS = {
  companyName: "INFORMATIVO REGIONAL LTDA",
  cnpj: "23970969000190",
  municipalRegistration: "1000546",
  municipality: "São João do Sul",
  state: "SC",
  ibgeCode: "4216404",
} as const;

/** Serviço de referência fornecido pelo prestador para a primeira consulta no ADN; não define alíquota ou regra municipal. */
export const NFSE_INITIAL_SERVICE_REFERENCE = {
  name: "Publicidade",
  nationalTaxCode: "170601",
  nbs: "1.1406.19.00",
} as const;

/** Resposta segura da consulta de parâmetros, sem certificado, chave ou material criptográfico. */
export interface NfseMunicipalParametersResult {
  environment: "restricted";
  municipalityCode: string;
  serviceCode: string;
  competence: string;
  fetchedAt: string;
  agreement: Record<string, unknown>;
  serviceParameters: Record<string, unknown>;
}

// --- Perfis de serviço ----------------------------------------------------

/**
 * Perfil de serviço (item 5) — evita preencher toda a configuração
 * fiscal manualmente em cada emissão. Nenhum valor fiscal é um seed
 * inventado: todos os campos abaixo começam vazios, o usuário
 * preenche conforme o que for aplicável ao seu município/serviço.
 * Nunca excluído depois de usado — só desativado (`active=false`).
 */
export interface NfseServiceProfile {
  id: string;
  name: string;
  active: boolean;
  /** Código de tributação nacional (cTribNac) — texto livre, nunca um enum com valores presumidos. */
  cTribNac?: string;
  /** Código de tributação municipal (cTribMun), quando aplicável. */
  cTribMun?: string;
  /** Nomenclatura Brasileira de Serviços (cNBS), quando aplicável. */
  cNBS?: string;
  defaultLocationMunicipality?: string;
  defaultLocationIbgeCode?: string;
  /** Configuração padrão de tributação do ISSQN — descrição livre (ex.: "Tributado no município do prestador"), nunca um código presumido. */
  issqnTaxation?: string;
  specialTaxRegime?: string;
  /**
   * `cAtvSN` — código de atividade do Simples Nacional (NT009 v1.01),
   * domínio FECHADO e oficial (ver NFSE_CATVSN_CODES): só os códigos
   * confirmados, nunca um valor livre. Descrição oficial de cada
   * código ainda não confirmada contra a fonte oficial — por isso a UI
   * mostra só o código, nunca um rótulo inventado (ver relatório desta
   * tarefa, item 6).
   */
  cAtvSN?: string;
  /**
   * CST (Código de Situação Tributária) de IBS/CBS — domínio da Reforma
   * Tributária do Consumo ainda NÃO confirmado contra uma fonte oficial
   * nesta revisão. Texto livre de propósito (nunca um enum com valores
   * presumidos) — mesmo princípio de cTribNac/cTribMun/cNBS.
   */
  cstIbsCbs?: string;
  /**
   * `cClassTrib` — classificação tributária de IBS/CBS. Domínio ainda
   * NÃO confirmado contra uma fonte oficial nesta revisão. Texto livre
   * de propósito, nunca um enum com valores presumidos.
   */
  cClassTrib?: string;
  /**
   * `cIndOp` — indicador de operação (Anexo VII cIndOp v1.03.00).
   * Domínio ainda NÃO confirmado contra uma fonte oficial nesta
   * revisão. Texto livre de propósito, nunca um enum com valores
   * presumidos. Valor PADRÃO do perfil — pode ser ajustado por
   * operação no rascunho (ver NfseFiscalSnapshot).
   */
  cIndOp?: string;
  notes?: string;
  createdByProfileId?: string;
  updatedByProfileId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * `cAtvSN` — domínio oficial CONFIRMADO diretamente no Anexo VI
 * IBS/CBS v1.04.01 (NT009 v1.01, planilha oficial do portal
 * gov.br/nfse — campo "cAtvSN", 2 caracteres, grupo
 * NFSe/infNFSe/DPS/infDPS/serv/cServ), não mais um palpite. Campo
 * numérico de 2 dígitos — "07"/"08"/"09", nunca "7"/"8"/"9" (largura
 * fixa confirmada na planilha oficial). Descrições abaixo são o texto
 * oficial literal da mesma célula, nunca reformuladas.
 *
 * Aplicabilidade confirmada no texto oficial do próprio campo: "Campo
 * deve ser informado apenas quando opSimpNac = 2 (MEI); ou 3 (ME/EPP);
 * ou 4 (Optante Pendente)" — mesma condição de
 * isIbsCbsSimplesRegimeApplicable. ATENÇÃO: a mesma planilha também
 * contém uma nota de regra de negócio dizendo o oposto pra MEI ("não
 * deve ser preenchido quando opSimpNac = 1 ou 2") — contradição real
 * entre dois trechos do próprio documento oficial, não resolvida aqui;
 * reportada no relatório da tarefa. Até confirmação humana, a
 * aplicação usa a nota do PRÓPRIO campo (a mais específica) como regra.
 */
export const NFSE_CATVSN_CODES = ["07", "08", "09", "10", "11", "12", "13", "14", "90"] as const;
export type NfseCAtvSNCode = (typeof NFSE_CATVSN_CODES)[number];
export const NFSE_CATVSN_LABELS: Record<NfseCAtvSNCode, string> = {
  "07": "Prestação de serviços, cessão de direitos, de uso ou de espaço com incidência do ISS, tributados exclusivamente pelo Anexo III",
  "08": "Prestação de serviços contábeis autorizados a pagar o ISS em valor fixo em guia do Município - Anexo III",
  "09": 'Prestação de serviços - Sujeitos ao Fator "R" – Anexo III ou V',
  "10": "Prestação de serviços de transporte municipal rodoviário, metroviário, ferroviário e aquaviário de passageiros relacionados no subitem 16.01 da lista anexa à LC 116/2003 - Anexo III",
  "11": "Locação de bens móveis e operações com serviços, bens imateriais e direitos, inclusive com bens imóveis, sem incidência de ISS - Anexo III",
  "12": "Prestação de serviços da área da construção civil relacionados nos subitens 7.02 e 7.05 da lista anexa à LC 116/2003 - Anexo III",
  "13": "Prestação de serviços da área da construção civil relacionados nos subitens 7.02 e 7.05 da lista anexa à LC 116/2003 - Anexo IV",
  "14": "Prestação de serviços - Anexo IV",
  "90": "Operações não tributadas",
};
export function isValidCAtvSN(value: string): boolean {
  return (NFSE_CATVSN_CODES as readonly string[]).includes(value);
}

/**
 * AJUSTE FINAL (Parte 2B): `issqnRate` (alíquota do ISSQN) foi REMOVIDO
 * de `NfseServiceProfile`/`NfseFiscalSnapshot` — nunca deveria ter sido
 * tratado como propriedade fiscal permanente de um perfil genérico
 * ("Publicidade", "Produção de vídeo" etc.). A alíquota depende do
 * município de incidência/regime tributário/regras do Simples Nacional,
 * que ainda não foram mapeados contra o XSD/DPS oficial. Removido sem
 * substituto inventado — nenhum campo novo, nenhum default, nenhuma
 * alíquota hardcoded (ex.: 3,2582%). `computeIssqnAmount` também foi
 * removido; o cálculo de `vISSQN` na DPS fica indisponível até essa
 * modelagem existir de fato (ver dps-builder.ts).
 */

/** Nunca preenche a descrição do serviço de um rascunho automaticamente —
 * toda nova NFS-e começa com descrição em branco (ajuste pós-revisão, item
 * 2); por isso o perfil de serviço não tem (e não deve ganhar) um campo de
 * "descrição padrão" pensado pra autopreenchimento. */

/** Só perfis ativos podem ser escolhidos numa nova emissão — perfis desativados continuam visíveis no histórico de rascunhos já criados, nunca escondidos retroativamente. */
export function listSelectableServiceProfiles(profiles: NfseServiceProfile[]): NfseServiceProfile[] {
  return profiles.filter((profile) => profile.active);
}

// --- Snapshot do tomador (cliente) e da configuração fiscal --------------

/**
 * Snapshot do tomador (item 7) — cópia independente dos dados do
 * cliente mestre no momento da emissão/rascunho. Editável só aqui;
 * nunca propaga de volta pro cadastro mestre a menos que uma ação
 * EXPLÍCITA ("salvar também no cadastro do cliente") seja disparada.
 * Sempre um objeto novo (nunca compartilha referência com o Client
 * original) — editar o snapshot depois nunca altera o cliente, e
 * alterar o cliente depois nunca altera um snapshot já criado.
 */
export interface NfseTomadorSnapshot {
  sourceClientId: string;
  kind: ClientKind;
  name: string;
  cpf?: string;
  cnpj?: string;
  municipalRegistration?: string;
  stateRegistration?: string;
  zip?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  ibgeCode?: string;
  email?: string;
  phone?: string;
}

/** Monta o snapshot a partir do cliente mestre — sempre um objeto novo (nunca referencia `client.address`), ver garantia de imutabilidade no comentário de NfseTomadorSnapshot. */
/**
 * E-mail fiscal: `fiscalEmail` primeiro, `email` como fallback só quando
 * vazio (nunca o contrário, nunca os dois gravados) — mesma regra já
 * documentada em `clients.fiscal_email` (ver
 * 20261025100000_clients_fiscal_fields.sql, ainda não aplicada
 * remotamente). `municipalRegistration`/`ibgeCode` do Cadastro só
 * passam a ser aproveitados aqui quando esses campos existirem no
 * client — enquanto o banco remoto não tiver as colunas, ambos
 * continuam `undefined` (o cliente carregado nunca terá essas
 * propriedades), preservando o comportamento atual sem quebrar nada.
 * `icmsStatus` NUNCA entra no snapshot — a NFS-e trata ISSQN, não ICMS
 * (item 15: "não forçar na NFS-e se não for necessário").
 */
export function buildTomadorSnapshotFromClient(client: Client, displayName: string): NfseTomadorSnapshot {
  return {
    sourceClientId: client.id,
    kind: client.kind,
    name: displayName,
    cpf: client.cpf,
    cnpj: client.cnpj,
    municipalRegistration: client.municipalRegistration,
    stateRegistration: client.stateRegistration,
    zip: client.address.zip,
    street: client.address.street,
    number: client.address.number,
    complement: client.address.complement,
    neighborhood: client.address.neighborhood,
    city: client.address.city,
    state: client.address.state,
    ibgeCode: client.addressIbgeCode,
    email: client.fiscalEmail || client.email,
    phone: client.whatsapp || client.phonePrimary,
  };
}

/**
 * Snapshot da configuração fiscal usada num rascunho (item 7/9) —
 * mesma garantia de independência do NfseTomadorSnapshot: editar o
 * rascunho depois nunca altera o NfseServiceProfile de origem.
 */
export interface NfseFiscalSnapshot {
  sourceServiceProfileId?: string;
  cTribNac?: string;
  cTribMun?: string;
  cNBS?: string;
  issqnTaxation?: string;
  specialTaxRegime?: string;
  locationMunicipality?: string;
  locationIbgeCode?: string;
  /** Copiado do perfil de serviço na criação do rascunho — ajustável por operação sem alterar o perfil mestre (ver NfseServiceProfile.cAtvSN). */
  cAtvSN?: string;
  /** Copiado do perfil de serviço — ver NfseServiceProfile.cstIbsCbs. */
  cstIbsCbs?: string;
  /** Copiado do perfil de serviço — ver NfseServiceProfile.cClassTrib. */
  cClassTrib?: string;
  /** Copiado do perfil de serviço (valor padrão) — ver NfseServiceProfile.cIndOp. Específico da operação: ajustável no rascunho. */
  cIndOp?: string;
  /**
   * Os 3 campos abaixo são copiados da CONFIGURAÇÃO DO PRESTADOR (nunca
   * do perfil de serviço) no momento em que o rascunho é criado —
   * mesmo princípio do snapshot do tomador: a configuração do prestador
   * pode mudar depois sem alterar retroativamente um rascunho já
   * existente. Nunca editáveis diretamente no rascunho (refletem a
   * configuração fiscal permanente do prestador, não a operação).
   */
  issuerSimplesNacionalOption?: NfseSimplesNacionalOption;
  issuerIbsCbsSimplesNacionalRegime?: NfseIbsCbsSimplesNacionalRegime;
  issuerSpecialTaxRegimeCode?: NfseSpecialTaxRegimeCode;
}

/**
 * Monta o snapshot fiscal do rascunho combinando o perfil de SERVIÇO
 * (campos que variam por atividade/operação: cTribNac/cAtvSN/CST/
 * cClassTrib/cIndOp) com a configuração do PRESTADOR (campos
 * permanentes: opSimpNac/regApIBSCBSSN/regime especial) — `issuer` é
 * opcional só pra não quebrar chamadores que ainda não carregam a
 * configuração do prestador neste ponto; sem ela, os 3 campos
 * `issuer*` ficam `undefined` (readiness.ts continua apontando o que
 * falta antes de transmitir).
 */
export function buildFiscalSnapshotFromServiceProfile(profile: NfseServiceProfile, issuer?: NfseIssuerConfig): NfseFiscalSnapshot {
  return {
    sourceServiceProfileId: profile.id,
    cTribNac: profile.cTribNac,
    cTribMun: profile.cTribMun,
    cNBS: profile.cNBS,
    issqnTaxation: profile.issqnTaxation,
    specialTaxRegime: profile.specialTaxRegime,
    locationMunicipality: profile.defaultLocationMunicipality,
    locationIbgeCode: profile.defaultLocationIbgeCode,
    cAtvSN: profile.cAtvSN,
    cstIbsCbs: profile.cstIbsCbs,
    cClassTrib: profile.cClassTrib,
    cIndOp: profile.cIndOp,
    issuerSimplesNacionalOption: issuer?.simplesNacionalOption,
    issuerIbsCbsSimplesNacionalRegime: issuer?.ibsCbsSimplesNacionalRegime,
    issuerSpecialTaxRegimeCode: issuer?.specialTaxRegimeCode,
  };
}

// --- Rascunho de NFS-e -----------------------------------------------------

/** Nesta fase só existe "draft" — nunca inventar authorized/rejected/
 * cancelled/substituted sem integração real (item 11). O tipo já é
 * uma union de propósito pra crescer na Parte 2 sem precisar recriar
 * a coluna. */
export type NfseDraftStatus = "draft";
export const NFSE_DRAFT_STATUSES: readonly NfseDraftStatus[] = ["draft"];
export const NFSE_DRAFT_STATUS_LABELS: Record<NfseDraftStatus, string> = {
  draft: "Rascunho",
};

/**
 * Origem de um rascunho — modelo genérico pensado para o futuro Altnix
 * Informativo (Comercial Fase 5): originSystem/originType/originRecordId
 * nunca dependem de uma FK cross-project (originRecordId é texto livre,
 * pode representar um registro de outro sistema/banco). commercialSaleId
 * é só conveniência LOCAL opcional pra join rápido — nunca a fonte de
 * verdade da origem.
 */
export interface NfseDraftOrigin {
  originSystem?: string;
  originType?: string;
  originRecordId?: string;
  commercialSaleId?: string;
}

export interface NfseDraft extends NfseDraftOrigin {
  id: string;
  reference: string;
  clientId: string;
  tomador: NfseTomadorSnapshot;
  serviceProfileId?: string;
  fiscal: NfseFiscalSnapshot;
  competencyDate: string;
  serviceValue: number;
  serviceDescription: string;
  notes?: string;
  status: NfseDraftStatus;
  createdByProfileId?: string;
  updatedByProfileId?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Emissão nacional (Parte 2A) -----------------------------------------
//
// Rascunho -> validação -> reservar DPS -> montar XML -> validar ->
// assinar -> transmitir -> autorização/rejeição -> registrar ->
// consultar. NÃO implementa cancelamento/substituição/produção real
// (ver docs/NFSE-NACIONAL-ARQUITETURA.md).

/** Produção permanece bloqueada nesta fase — trava explícita na
 * aplicação, não só na configuração (item 2/18). Único lugar que
 * decide isso; nunca duplicar esta regra em outro ponto do código. */
export function isTransmissionEnvironmentAllowed(environment: NfseEnvironment): boolean {
  return environment === "homologation";
}

/**
 * Identificador da DPS (item 5; CONFIRMADO E CORRIGIDO na Parte 2B
 * contra o XSD oficial vigente — `TSIdDPS` em
 * `xsd/prodrest-v1.01-20260727/tiposSimples_v1.01.xsd`, pacote
 * `NFSE_SCHEMA_PACKAGE_HOMOLOGATION`): literal "DPS" + Cód.Município(7)
 * + Tipo de Inscrição Federal(1: 1=CPF, 2=CNPJ) + Inscrição Federal(14,
 * CPF completado com zeros à esquerda) + Série(5) + Número(15) = 45
 * caracteres. `pattern="DPS[0-9]{7}(1[0-9]{14}|2[0-9A-Z]{14})[0-9]{20}"`
 * — o tipo "2" (CNPJ) aceita letras porque o CNPJ alfanumérico da
 * Reforma Tributária pode conter letras; esta implementação só emite
 * CNPJ numérico (não há suporte a CNPJ alfanumérico no domínio ainda).
 * A versão anterior desta função (42 caracteres, sem o prefixo "DPS")
 * estava incompleta — corrigida nesta revisão.
 */
export function buildDpsId(input: {
  ibgeCode: string;
  federalInscriptionType: "cpf" | "cnpj";
  federalInscription: string;
  series: string;
  number: number;
}): string {
  const municipality = input.ibgeCode.padStart(7, "0").slice(-7);
  const inscriptionTypeCode = input.federalInscriptionType === "cpf" ? "1" : "2";
  const federalInscription = input.federalInscription.replace(/\D/g, "").padStart(14, "0").slice(-14);
  const series = input.series.padStart(5, "0").slice(-5);
  const number = String(input.number).padStart(15, "0").slice(-15);
  return `DPS${municipality}${inscriptionTypeCode}${federalInscription}${series}${number}`;
}

/**
 * Validação de FORMATO da série da DPS — só o que está confirmado pelo
 * Manual de Contribuintes vigente (item 2 do ajuste de segurança): o
 * campo "Série DPS" do identificador tem largura 5 (ver buildDpsId).
 * NUNCA valida uma faixa semântica específica (ex.: "1-49999 só pra
 * aplicativo próprio") — essa regra de negócio não foi confirmada
 * contra uma fonte oficial vigente nesta fase, então não é aplicada;
 * a transmissão real continua bloqueada por outros motivos
 * (certificado/assinatura/XSD) até lá.
 */
export function isValidDpsSeriesFormat(series: string): boolean {
  return /^[0-9]{1,5}$/.test(series);
}

/**
 * Validações de FORMATO (Parte 2C) contra os tipos simples do XSD
 * oficial (`tiposSimples_v1.01.xsd`) — nunca validam o CONTEÚDO/valor
 * fiscal (isso é decisão do usuário, nunca inventada aqui), só o
 * formato exigido pelo schema: `TSCodTribNac` (6 dígitos),
 * `TCCodTribMun` (3 dígitos), `TSCodNBS` (9 dígitos).
 */
export function isValidCTribNacFormat(value: string): boolean {
  return /^[0-9]{6}$/.test(value);
}
export function isValidCTribMunFormat(value: string): boolean {
  return /^[0-9]{3}$/.test(value);
}
export function isValidCNBSFormat(value: string): boolean {
  return /^[0-9]{9}$/.test(value);
}

/** Nunca inventado — authorized/rejected só existem depois de resposta
 * real; "uncertain" cobre timeout/falha de rede (item 11), nunca dispara
 * nova DPS/retransmissão automática. */
export type NfseTransmissionStatus = "pending" | "authorized" | "rejected" | "uncertain";
export const NFSE_TRANSMISSION_STATUSES: readonly NfseTransmissionStatus[] = ["pending", "authorized", "rejected", "uncertain"];
export const NFSE_TRANSMISSION_STATUS_LABELS: Record<NfseTransmissionStatus, string> = {
  pending: "Em processamento",
  authorized: "Autorizada",
  rejected: "Rejeitada",
  uncertain: "Resultado incerto (confirmar antes de repetir)",
};

/** Histórico TÉCNICO de uma tentativa de transmissão (item 11/13) —
 * nunca segredo/senha/PFX/chave privada. Separado de audit_events por
 * design (audit_events = ação; isto = detalhe técnico da transmissão). */
export interface NfseTransmissionAttempt {
  id: string;
  draftId: string;
  /** Identificador completo da DPS (buildDpsId) — gravado como SNAPSHOT
   * imutável no momento da tentativa (auditoria estrutural 26/10/2026,
   * Bloco 1, item 2), nunca reconstruído depois a partir da configuração
   * atual do emissor (que pode ter mudado entre a tentativa e uma
   * eventual reconciliação). Necessário pra consultDps()/reconciliação
   * sem depender de nada que possa variar com o tempo. */
  dpsId?: string;
  dpsSeries?: string;
  dpsNumber?: number;
  environment: NfseEnvironment;
  status: NfseTransmissionStatus;
  requestReference?: string;
  responseSummary?: string;
  rejectionCode?: string;
  rejectionMessage?: string;
  issuedNoteId?: string;
  createdByProfileId?: string;
  createdAt: string;
}

/**
 * NFS-e efetivamente AUTORIZADA (item 10) — só nasce depois de resposta
 * oficial válida. Preserva o snapshot fiscal realmente transmitido
 * (XML assinado + XML de retorno); alterações futuras em cliente/
 * perfil/configuração NUNCA alteram esta linha. accessKey/nfseNumber/
 * issuedAt só vêm da resposta oficial — nunca calculados aqui.
 */
export interface NfseIssuedNote {
  id: string;
  draftId: string;
  issuerConfigId: string;
  clientId: string;
  environment: NfseEnvironment;
  dpsSeries: string;
  dpsNumber: number;
  dpsId: string;
  accessKey?: string;
  nfseNumber?: string;
  issuedAt?: string;
  competencyDate: string;
  serviceValue: number;
  signedDpsXml: string;
  nfseXml?: string;
  createdByProfileId?: string;
  createdAt: string;
}

/**
 * Preparação do cancelamento (Item 5, Lote 2, Tarefa 5) — código e
 * rótulo vêm do XSD oficial vendorizado (tiposSimples_v1.01.xsd,
 * TSCodJustCanc), nunca inventados.
 */
export type NfseCancellationJustificationCode = 1 | 2 | 9;
export const NFSE_CANCELLATION_JUSTIFICATION_LABELS: Record<NfseCancellationJustificationCode, string> = {
  1: "Erro na Emissão",
  2: "Serviço não Prestado",
  9: "Outros",
};
export type NfseCancellationStatus = "pending" | "submitted" | "confirmed" | "rejected" | "uncertain";
export interface NfseCancellationRequest {
  id: string;
  issuedNoteId: string;
  justificationCode: NfseCancellationJustificationCode;
  justificationText: string;
  status: NfseCancellationStatus;
  requestedByProfileId?: string;
  requestedAt: string;
  submittedAt?: string;
  responseSummary?: string;
  rejectionCode?: string;
  rejectionMessage?: string;
  createdAt: string;
}

/**
 * Dados necessários pra montar a DPS/revisão de transmissão (Parte 2A,
 * item 6/14) — monta a partir do que já existe (config do prestador,
 * snapshot do tomador, snapshot fiscal, rascunho), nunca pede de novo o
 * que já está no rascunho.
 */
export interface DpsBuildInput {
  issuer: Pick<
    NfseIssuerConfig,
    "companyName" | "cnpj" | "municipalRegistration" | "ibgeCode" | "municipality" | "state" | "simplesNacionalOption" | "specialTaxRegimeCode"
  >;
  tomador: NfseTomadorSnapshot;
  fiscal: NfseFiscalSnapshot;
  competencyDate: string;
  serviceValue: number;
  serviceDescription: string;
  environment: NfseEnvironment;
  dpsSeries: string;
  dpsNumber: number;
}
