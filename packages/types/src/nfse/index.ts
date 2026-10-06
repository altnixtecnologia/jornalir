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
  homologation: "Homologação",
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
  municipality: string;
  state: string;
  ibgeCode: string;
  /** Regime tributário geral (ex.: Simples Nacional) — conceito de negócio comum, nunca um código de tributação da NFS-e. Exige configuração explícita, nunca assumido silenciosamente. */
  taxRegime?: string;
  specialTaxRegime?: string;
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
export const NFSE_SCHEMA_PACKAGE_HOMOLOGATION = "NFSe-ESQUEMAS_XSD-PRODREST-v1.01-20260727";

/** Valores sugeridos pra primeira configuração — nunca aplicados automaticamente, só usados como `defaultValue` num formulário que o usuário ainda precisa salvar explicitamente. */
export const NFSE_SUGGESTED_ISSUER_DEFAULTS = {
  companyName: "INFORMATIVO REGIONAL LTDA",
  cnpj: "23970969000190",
  municipalRegistration: "1000546",
  municipality: "São João do Sul",
  state: "SC",
  ibgeCode: "4216404",
} as const;

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
  notes?: string;
  createdByProfileId?: string;
  updatedByProfileId?: string;
  createdAt: string;
  updatedAt: string;
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
export function buildTomadorSnapshotFromClient(client: Client, displayName: string): NfseTomadorSnapshot {
  return {
    sourceClientId: client.id,
    kind: client.kind,
    name: displayName,
    cpf: client.cpf,
    cnpj: client.cnpj,
    municipalRegistration: undefined,
    stateRegistration: client.stateRegistration,
    zip: client.address.zip,
    street: client.address.street,
    number: client.address.number,
    complement: client.address.complement,
    neighborhood: client.address.neighborhood,
    city: client.address.city,
    state: client.address.state,
    ibgeCode: undefined,
    email: client.email,
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
}

export function buildFiscalSnapshotFromServiceProfile(profile: NfseServiceProfile): NfseFiscalSnapshot {
  return {
    sourceServiceProfileId: profile.id,
    cTribNac: profile.cTribNac,
    cTribMun: profile.cTribMun,
    cNBS: profile.cNBS,
    issqnTaxation: profile.issqnTaxation,
    specialTaxRegime: profile.specialTaxRegime,
    locationMunicipality: profile.defaultLocationMunicipality,
    locationIbgeCode: profile.defaultLocationIbgeCode,
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

export interface NfseDraft {
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
 * Dados necessários pra montar a DPS/revisão de transmissão (Parte 2A,
 * item 6/14) — monta a partir do que já existe (config do prestador,
 * snapshot do tomador, snapshot fiscal, rascunho), nunca pede de novo o
 * que já está no rascunho.
 */
export interface DpsBuildInput {
  issuer: Pick<NfseIssuerConfig, "companyName" | "cnpj" | "municipalRegistration" | "ibgeCode" | "municipality" | "state">;
  tomador: NfseTomadorSnapshot;
  fiscal: NfseFiscalSnapshot;
  competencyDate: string;
  serviceValue: number;
  serviceDescription: string;
  environment: NfseEnvironment;
  dpsSeries: string;
  dpsNumber: number;
}
