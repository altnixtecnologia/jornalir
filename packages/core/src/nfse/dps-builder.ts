import type { DpsBuildInput } from "@ir/types";
import { computeIssqnAmount } from "@ir/types";

/**
 * Builder determinístico da DPS (Parte 2A, item 6) — cobre só o
 * cenário inicial decidido: prestador PJ brasileiro, tomador PF/PJ
 * brasileiro, serviço comum, sem intermediário/obra/evento especial/
 * exterior/decisão administrativa-judicial/substituição. Gera só os
 * elementos realmente necessários a este cenário, nunca tenta cobrir
 * todas as tags possíveis do XSD.
 *
 * IMPORTANTE: os nomes de elemento usados aqui (infDPS/prest/toma/
 * serv/valores/tribMunicipal/tribISSQN) seguem a nomenclatura comum já
 * publicada do leiaute nacional da NFS-e (DPS/ANEXO I), mas ESTE
 * BUILDER AINDA NÃO FOI VALIDADO contra o XSD oficial vigente — isso é
 * trabalho da camada de validação estrutural (ver dps-builder.test.ts
 * e o comentário em validateDpsXmlStructure) e precisa ser confirmado
 * antes de qualquer transmissão real.
 */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: string | number | undefined): string {
  if (value === undefined || value === "") return "";
  return `<${name}>${escapeXml(String(value))}</${name}>`;
}

function federalInscriptionTag(kind: "individual" | "company", cpf: string | undefined, cnpj: string | undefined): string {
  return kind === "individual" ? tag("CPF", cpf) : tag("CNPJ", cnpj);
}

/**
 * Monta o XML da DPS (ainda NÃO assinado) a partir dos dados já
 * existentes no rascunho/configuração — nunca inventa valor, alíquota
 * ou código fiscal. `computeIssqnAmount` só calcula o ISSQN quando a
 * alíquota foi explicitamente configurada; se não houver, o bloco de
 * valores de tributo fica incompleto DE PROPÓSITO (a validação
 * bloqueia a transmissão nesse caso, ver transmission-service.ts).
 */
export function buildDpsXml(input: DpsBuildInput): string {
  const issqnAmount = computeIssqnAmount(input.serviceValue, input.fiscal.issqnRate);
  const dhEmi = new Date().toISOString();

  const prest = [
    tag("CNPJ", input.issuer.cnpj),
    tag("IM", input.issuer.municipalRegistration),
    tag("xNome", input.issuer.companyName),
  ].join("");

  const toma = [
    federalInscriptionTag(input.tomador.kind, input.tomador.cpf, input.tomador.cnpj),
    tag("IM", input.tomador.municipalRegistration),
    tag("xNome", input.tomador.name),
    tag("email", input.tomador.email),
    [
      tag("xLgr", input.tomador.street),
      tag("nro", input.tomador.number),
      tag("xCpl", input.tomador.complement),
      tag("xBairro", input.tomador.neighborhood),
      tag("cMun", input.tomador.ibgeCode),
      tag("UF", input.tomador.state),
      tag("CEP", input.tomador.zip),
    ].join(""),
  ].join("");

  const serv = [
    tag("cTribNac", input.fiscal.cTribNac),
    tag("cTribMun", input.fiscal.cTribMun),
    tag("cNBS", input.fiscal.cNBS),
    tag("cLocPrestacao", input.fiscal.locationIbgeCode || input.issuer.ibgeCode),
    tag("xDescServ", input.serviceDescription),
  ].join("");

  const valores = [
    tag("vServPrest", input.serviceValue.toFixed(2)),
    issqnAmount !== undefined ? tag("vBC", input.serviceValue.toFixed(2)) + tag("pAliq", (input.fiscal.issqnRate ?? 0).toFixed(2)) + tag("vISSQN", issqnAmount.toFixed(2)) : "",
  ].join("");

  const infDps = [
    tag("tpAmb", input.environment === "production" ? "1" : "2"),
    tag("dhEmi", dhEmi),
    tag("dCompet", input.competencyDate),
    tag("serie", input.dpsSeries),
    tag("nDPS", String(input.dpsNumber)),
    `<prest>${prest}</prest>`,
    `<toma>${toma}</toma>`,
    `<serv>${serv}</serv>`,
    `<valores>${valores}</valores>`,
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="http://www.sped.fazenda.gov.br/nfse"><infDPS>${infDps}</infDPS></DPS>`;
}

export interface DpsXmlValidationResult {
  structurallyValid: boolean;
  issues: string[];
}

/**
 * VALIDAÇÃO ESTRUTURAL (ajuste de segurança pós-revisão, item 5) — NÃO
 * é "validação XSD" e nunca deve ser chamada assim. Confere só que os
 * elementos obrigatórios pro nosso cenário estão presentes e bem
 * formados (presença de tags, abertura de `<?xml`). Validação XSD REAL
 * significaria carregar o pacote de esquemas oficial vigente (ver
 * `NFSE_SCHEMA_PACKAGE_HOMOLOGATION` em @ir/types, "NFSe-ESQUEMAS_XSD-
 * PRODREST-v1.01-20260727" pra Produção Restrita — nunca misturado com
 * o pacote de Produção) e rodar um validador XML real contra ele; isso
 * NÃO existe nesta fase. Enquanto só esta validação estrutural existir,
 * a transmissão real contra a API Nacional continua bloqueada (ver
 * `RealTransmissionNotReadyError` em national-nfse-provider.ts).
 */
export function validateDpsXmlStructure(xml: string): DpsXmlValidationResult {
  const issues: string[] = [];
  const requiredElements = ["<DPS", "<infDPS>", "<prest>", "<toma>", "<serv>", "<valores>", "<tpAmb>", "<dCompet>", "<serie>", "<nDPS>", "<xDescServ>", "<vServPrest>"];
  for (const element of requiredElements) {
    if (!xml.includes(element)) issues.push(`Elemento obrigatório ausente: ${element}`);
  }
  if (!xml.trim().startsWith("<?xml")) issues.push("XML sem declaração de versão/encoding.");
  return { structurallyValid: issues.length === 0, issues };
}

export interface NfseAuthorizationResult {
  accessKey: string;
  nfseNumber: string;
  issuedAt: string;
  nfseXml: string;
}

export interface NfseRejectionResult {
  code: string;
  message: string;
}

/**
 * Parsers da resposta oficial (item 20 — "parser de resposta de
 * sucesso"/"parser de rejeições"). Nesta fase trabalham só sobre
 * fixtures/mocks (ver test/) — nunca chamam a API real. O formato
 * exato do payload (JSON com XML embutido vs. XML puro) depende da
 * especificação vigente do Emissor Nacional; aqui aceitamos um
 * envelope JSON simples `{ status, accessKey?, nfseNumber?, issuedAt?,
 * nfseXml?, rejection?: { code, message } }` como contrato interno
 * PROVISÓRIO do NationalNfseProvider — nunca o formato oficial bruto
 * da API, que será mapeado pra este contrato na implementação real
 * (ainda não escrita).
 */
export interface NationalNfseResponseEnvelope {
  status: "authorized" | "rejected";
  accessKey?: string;
  nfseNumber?: string;
  issuedAt?: string;
  nfseXml?: string;
  rejection?: { code: string; message: string };
}

export function parseAuthorizationResponse(envelope: NationalNfseResponseEnvelope): NfseAuthorizationResult | null {
  if (envelope.status !== "authorized") return null;
  if (!envelope.accessKey || !envelope.nfseNumber || !envelope.issuedAt || !envelope.nfseXml) return null;
  return { accessKey: envelope.accessKey, nfseNumber: envelope.nfseNumber, issuedAt: envelope.issuedAt, nfseXml: envelope.nfseXml };
}

export function parseRejectionResponse(envelope: NationalNfseResponseEnvelope): NfseRejectionResult | null {
  if (envelope.status !== "rejected") return null;
  if (!envelope.rejection) return { code: "UNKNOWN", message: "Rejeitada sem detalhe informado pelo Sistema Nacional." };
  return envelope.rejection;
}
