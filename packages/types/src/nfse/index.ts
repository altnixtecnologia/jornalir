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
  notes?: string;
  createdByProfileId?: string;
  updatedByProfileId?: string;
  createdAt: string;
  updatedAt: string;
}

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
