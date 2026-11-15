import { DOMParser } from "@xmldom/xmldom";
import type { NfseIssuedNote } from "@ir/types";
import { isValidNfseAccessKey } from "./access-key";

/**
 * Extração dos dados do DANFSe (Bloco 2, 26/10/2026 — "Extrair os dados
 * do XML da NFS-e autorizada, sem inventar valores fiscais nem confiar
 * em campos manipuláveis pelo navegador") a partir da `NfseIssuedNote`
 * JÁ PERSISTIDA (nunca de um formulário/entrada do navegador).
 *
 * DECISÃO DE DESIGN importante: a identificação (chave de acesso,
 * número da NFS-e, competência, valor do serviço) vem das COLUNAS
 * separadas da `NfseIssuedNote` (`accessKey`/`nfseNumber`/
 * `competencyDate`/`serviceValue`) — NUNCA re-extraída do `nfseXml`.
 * Isso é deliberado: o XSD oficial vendorizado (`TCInfNFSe`,
 * `tiposComplexos_v1.01.xsd`) NÃO TEM nenhum elemento "chave de acesso"
 * dentro da própria NFS-e (confirmado em `sefin-nacional-client.ts`,
 * `extractAccessKey()` — "nunca deriva do atributo Id sem confirmação").
 * Re-tentar extrair isso do XML aqui repetiria esse mesmo erro
 * potencial; as colunas da issued note já vieram do envelope oficial
 * (`chaveAcesso` do JSON de resposta), então são a fonte confiável.
 *
 * O `nfseXml` só é usado pra detalhe que NÃO tem coluna própria:
 * prestador/tomador, serviço, tributação municipal, valores
 * detalhados. Nomes de elemento confirmados DIRETAMENTE contra o XSD
 * oficial vendorizado (`tiposComplexos_v1.01.xsd`: `TCInfNFSe`,
 * `TCEmitente`, `TCEnderecoEmitente`, `TCValoresNFSe`, `TCInfoPessoa`,
 * `TCInfDPS`; `tiposSimples_v1.01.xsd`: `TStat`) — nunca um resumo de
 * terceiro.
 *
 * FAIL-CLOSED: qualquer campo OBRIGATÓRIO pelo Anexo I (NT 008/2026
 * v1.02, seção 2.1) ausente faz esta função lançar `DanfseDataError` —
 * nunca preenche com um valor inventado. Campos OPCIONAIS ausentes
 * viram `undefined`; o renderizador do PDF os imprime como "-" (regra
 * explícita da seção 2.4.5, nota 12).
 */

export class DanfseDataError extends Error {}

// Tipos do próprio xmldom (nunca o `Document`/`Element` globais do lib.dom —
// conflitam em projetos Next.js, que incluem a lib "dom"; mesmo cuidado de
// sefin-nacional-client.ts, que nunca anota essas variáveis explicitamente).
type XmlDoc = ReturnType<DOMParser["parseFromString"]>;
type XmlElement = ReturnType<XmlDoc["getElementsByTagName"]>[number];

function text(doc: XmlDoc, tagName: string, scope?: XmlElement): string | undefined {
  // Nunca buscar no documento inteiro quando um grupo opcional não existe.
  // Isso faria dados de ISSQN aparecerem falsamente como IBS/CBS/federal.
  if (!scope) return undefined;
  const found = scope.getElementsByTagName(tagName)[0]?.textContent?.trim();
  return found && found.length > 0 ? found : undefined;
}

function requireText(tagName: string, value: string | undefined, context: string): string {
  if (!value) throw new DanfseDataError(`Campo obrigatório "${tagName}" ausente no XML da NFS-e (${context}) — DANFSe não pode ser gerado sem este dado real.`);
  return value;
}

const STAT_LABELS: Record<string, string> = {
  "100": "NFS-e Gerada",
  "102": "NFS-e de Decisão Judicial",
  "103": "NFS-e Avulsa",
  "107": "NFS-e MEI",
};

export interface DanfsePessoaData {
  federalInscription: string;
  municipalRegistration?: string;
  name: string;
  phone?: string;
  email?: string;
  state?: string;
  ibgeCode?: string;
  zipCode?: string;
  address?: string;
}

export interface DanfseData {
  accessKey: string;
  nfseNumber: string;
  competencyDate: string;
  nfseIssuedAt: string;
  serviceValue: number;
  dpsNumber: string;
  dpsSeries: string;
  dpsIssuedAt: string;
  emitterMunicipality?: string;
  statusCode: string;
  statusLabel: string;
  issuerLabel: string;
  purposeLabel: string;
  isHomologation: boolean;
  prestador: DanfsePessoaData;
  tomador?: DanfsePessoaData;
  serviceDescription: string;
  nationalServiceCode?: string;
  municipalServiceCode?: string;
  serviceLocationIbgeCode?: string;
  issqnTaxBase?: string;
  issqnRateApplied?: string;
  issqnAmount?: string;
  totalRetained?: string;
  netValue?: string;
  // Fonte exclusiva: XML autorizado; ausência de campo opcional => undefined.
  prestadorSimplesOption?: string;
  prestadorSnApuracao?: string;
  nbsCode?: string;
  nationalServiceDescription?: string;
  municipalServiceDescription?: string;
  issqnTaxationType?: string;
  issqnIncidenceLocation?: string;
  issqnRetentionType?: string;
  issqnSpecialTaxRegime?: string;
  issqnDiscountUnconditional?: string;
  federalIrrf?: string;
  federalSocialSecurityRetained?: string;
  federalSocialContribRetained?: string;
  federalPis?: string;
  federalCofins?: string;
  federalPisCofinsRetention?: string;
  ibsCbsCst?: string;
  ibsCbsTaxClass?: string;
  ibsCbsOperationIndicator?: string;
  ibsCbsBase?: string;
  ibsCbsLocation?: string;
  ibsCbsRateState?: string;
  ibsCbsRateCity?: string;
  ibsCbsRateFederal?: string;
  ibsCbsEffectiveRateState?: string;
  ibsCbsEffectiveRateCity?: string;
  ibsCbsEffectiveRateFederal?: string;
  ibsCbsValueState?: string;
  ibsCbsValueCity?: string;
  ibsCbsValueFederal?: string;
  ibsCbsTotal?: string;
  grossTotalWithIbsCbs?: string;
  discountConditional?: string;
  discountUnconditional?: string;
  complementaryInformation?: string;
  municipalAdditionalInformation?: string;
}

function extractAddress(doc: XmlDoc, scope: XmlElement | undefined): { address?: string; state?: string; ibgeCode?: string; zipCode?: string } {
  if (!scope) return {};
  const endScope = scope.getElementsByTagName("end")[0] ?? scope.getElementsByTagName("enderNac")[0] ?? scope;
  const logradouro = text(doc, "xLgr", endScope);
  const numero = text(doc, "nro", endScope);
  const complemento = text(doc, "xCpl", endScope);
  const bairro = text(doc, "xBairro", endScope);
  const parts = [logradouro, numero ? `nº ${numero}` : undefined, complemento, bairro].filter(Boolean);
  return {
    address: parts.length > 0 ? parts.join(", ") : undefined,
    ibgeCode: text(doc, "cMun", endScope),
    state: text(doc, "UF", endScope),
    zipCode: text(doc, "CEP", endScope),
  };
}

function extractPessoa(doc: XmlDoc, scope: XmlElement | undefined, context: string, required: boolean): DanfsePessoaData | undefined {
  if (!scope) {
    if (required) throw new DanfseDataError(`Grupo obrigatório ausente no XML da NFS-e (${context}).`);
    return undefined;
  }
  const federalInscription = text(doc, "CNPJ", scope) ?? text(doc, "CPF", scope) ?? text(doc, "NIF", scope);
  const name = text(doc, "xNome", scope);
  if (!federalInscription || !name) {
    if (required) throw new DanfseDataError(`Identificação (CNPJ/CPF e nome) ausente no XML da NFS-e (${context}).`);
    return undefined;
  }
  return {
    federalInscription,
    name,
    municipalRegistration: text(doc, "IM", scope),
    phone: text(doc, "fone", scope),
    email: text(doc, "email", scope),
    ...extractAddress(doc, scope),
  };
}

/**
 * Extrai os dados do DANFSe. `issuedNote` precisa ter `nfseXml`
 * presente (só existe depois de autorização real) — lança
 * `DanfseDataError` (fail-closed) se o XML estiver ausente, inválido
 * ou faltando qualquer campo obrigatório do Anexo I.
 */
export function extractDanfseData(issuedNote: Pick<NfseIssuedNote, "environment" | "accessKey" | "nfseNumber" | "issuedAt" | "competencyDate" | "serviceValue" | "nfseXml" | "dpsNumber" | "dpsSeries">): DanfseData {
  if (!issuedNote.accessKey || !issuedNote.nfseNumber || !issuedNote.issuedAt) {
    throw new DanfseDataError("NFS-e sem chave de acesso/número/data de autorização — o DANFSe só pode ser gerado a partir de uma NFS-e efetivamente autorizada.");
  }
  // TSChaveNFSe: 50 caracteres, incluindo CNPJ alfanumérico quando houver.
  // Nunca gerar QR de uma chave malformada nem rejeitar chave válida com letras.
  if (!isValidNfseAccessKey(issuedNote.accessKey)) {
    throw new DanfseDataError("Chave de acesso fora do padrão nacional TSChaveNFSe de 50 caracteres — DANFSe bloqueado.");
  }
  if (!issuedNote.nfseXml || issuedNote.nfseXml.trim().length === 0) {
    throw new DanfseDataError("XML da NFS-e ausente — o DANFSe só pode ser gerado a partir do XML real retornado pela SEFIN.");
  }
  let doc: XmlDoc;
  try {
    doc = new DOMParser().parseFromString(issuedNote.nfseXml, "text/xml");
  } catch {
    throw new DanfseDataError("XML da NFS-e inválido — não foi possível interpretar o documento.");
  }
  const infNFSe = doc.getElementsByTagName("infNFSe")[0];
  if (!infNFSe) throw new DanfseDataError("Elemento infNFSe ausente — o XML não corresponde ao esquema oficial de NFS-e autorizada.");

  const dps = infNFSe.getElementsByTagName("DPS")[0];
  const infDPS = dps?.getElementsByTagName("infDPS")[0];
  if (!infDPS) throw new DanfseDataError("DPS original (DPS/infDPS) ausente dentro da NFS-e — necessária pra competência, tomador e serviço.");

  const prestador = extractPessoa(doc, infNFSe.getElementsByTagName("emit")[0], "emit — prestador", true)!;
  const tomador = extractPessoa(doc, infDPS.getElementsByTagName("toma")[0], "infDPS/toma — tomador", false);

  const serv = infDPS.getElementsByTagName("serv")[0];
  const valoresNFSe = infNFSe.getElementsByTagName("valores")[0];
  const prest = infDPS.getElementsByTagName("prest")[0];
  const regTrib = prest?.getElementsByTagName("regTrib")[0];
  const dpsValores = infDPS.getElementsByTagName("valores")[0];
  const dpsTrib = dpsValores?.getElementsByTagName("trib")[0];
  const tribMun = dpsTrib?.getElementsByTagName("tribMun")[0];
  const tribFed = dpsTrib?.getElementsByTagName("tribFed")[0];
  const pisCofins = tribFed?.getElementsByTagName("piscofins")[0];
  const descontos = dpsValores?.getElementsByTagName("vDescCondIncond")[0];
  const infoCompl = serv?.getElementsByTagName("infoCompl")[0];
  const ibsCbs = infNFSe.getElementsByTagName("IBSCBS")[0];
  const ibsValues = ibsCbs?.getElementsByTagName("valores")[0];
  const ibsUf = ibsValues?.getElementsByTagName("uf")[0];
  const ibsMun = ibsValues?.getElementsByTagName("mun")[0];
  const ibsFed = ibsValues?.getElementsByTagName("fed")[0];
  const ibsTotals = ibsCbs?.getElementsByTagName("totCIBS")[0];
  const ibsTotal = ibsTotals?.getElementsByTagName("gIBS")[0];
  const ibsTotalUf = ibsTotal?.getElementsByTagName("gIBSUFTot")[0];
  const ibsTotalMun = ibsTotal?.getElementsByTagName("gIBSMunTot")[0];
  const ibsTotalCbs = ibsTotals?.getElementsByTagName("gCBS")[0];
  const dpsIbsCbs = infDPS.getElementsByTagName("IBSCBS")[0];

  const tpAmb = requireText("tpAmb", text(doc, "tpAmb", infDPS), "infDPS");
  if (tpAmb !== "1" && tpAmb !== "2") throw new DanfseDataError(`tpAmb=${tpAmb} não reconhecido na DPS.`);
  if ((tpAmb === "2") !== (issuedNote.environment === "homologation")) {
    throw new DanfseDataError("Ambiente da DPS não corresponde ao ambiente registrado da nota.");
  }
  const cStat = requireText("cStat", text(doc, "cStat", infNFSe), "infNFSe");
  const statusLabel = STAT_LABELS[cStat];
  if (!statusLabel) throw new DanfseDataError(`Situação cStat=${cStat} sem descrição validada no leiaute nacional.`);
  // Emitente e finalidade vêm da DPS embutida, não de nomes ou textos fixos do PDF.
  const tpEmit = requireText("tpEmit", text(doc, "tpEmit", infDPS), "infDPS");
  const issuerLabel = ({ "1": "Prestador", "2": "Tomador", "3": "Intermediário" } as Record<string, string>)[tpEmit];
  if (!issuerLabel) throw new DanfseDataError(`Emitente tpEmit=${tpEmit} não reconhecido no XML autorizado.`);
  const finNFSe = requireText("finNFSe", text(doc, "finNFSe", infDPS), "infDPS");
  // O XSD nacional atualmente versionado no projeto só permite 0 para o caso regular.
  if (finNFSe !== "0") throw new DanfseDataError(`Finalidade finNFSe=${finNFSe} sem descrição validada no leiaute atual.`);

  return {
    accessKey: issuedNote.accessKey,
    nfseNumber: issuedNote.nfseNumber,
    competencyDate: issuedNote.competencyDate,
    nfseIssuedAt: issuedNote.issuedAt,
    serviceValue: issuedNote.serviceValue,
    dpsNumber: String(issuedNote.dpsNumber),
    dpsSeries: issuedNote.dpsSeries,
    dpsIssuedAt: requireText("dhEmi", text(doc, "dhEmi", infDPS), "infDPS/dhEmi"),
    emitterMunicipality: text(doc, "xLocEmi", infNFSe),
    statusCode: cStat,
    statusLabel,
    issuerLabel,
    purposeLabel: "NFS-e regular",
    isHomologation: tpAmb === "2",
    prestador,
    tomador,
    serviceDescription: requireText("xDescServ", text(doc, "xDescServ", serv), "infDPS/serv/cServ/xDescServ"),
    nationalServiceCode: text(doc, "cTribNac", serv),
    municipalServiceCode: text(doc, "cTribMun", serv),
    serviceLocationIbgeCode: text(doc, "cLocPrestacao", serv),
    issqnTaxBase: text(doc, "vBC", valoresNFSe),
    issqnRateApplied: text(doc, "pAliqAplic", valoresNFSe),
    issqnAmount: text(doc, "vISSQN", valoresNFSe),
    totalRetained: text(doc, "vTotalRet", valoresNFSe),
    netValue: text(doc, "vLiq", valoresNFSe),
    prestadorSimplesOption: text(doc, "opSimpNac", regTrib),
    prestadorSnApuracao: text(doc, "regApTribSN", regTrib),
    nbsCode: text(doc, "cNBS", serv),
    nationalServiceDescription: text(doc, "xTribNac", infNFSe),
    municipalServiceDescription: text(doc, "xTribMun", infNFSe),
    issqnTaxationType: text(doc, "tribISSQN", tribMun),
    issqnIncidenceLocation: text(doc, "xLocIncid", infNFSe) ?? text(doc, "cLocIncid", infNFSe),
    issqnRetentionType: text(doc, "tpRetISSQN", tribMun),
    issqnSpecialTaxRegime: text(doc, "regEspTrib", regTrib),
    issqnDiscountUnconditional: text(doc, "vDescIncond", descontos),
    federalIrrf: text(doc, "vRetIRRF", tribFed),
    federalSocialSecurityRetained: text(doc, "vRetCP", tribFed),
    federalSocialContribRetained: text(doc, "vRetCSLL", tribFed),
    federalPis: text(doc, "vPis", pisCofins),
    federalCofins: text(doc, "vCofins", pisCofins),
    federalPisCofinsRetention: text(doc, "tpRetPisCofins", pisCofins),
    ibsCbsCst: text(doc, "CST", dpsIbsCbs),
    ibsCbsTaxClass: text(doc, "cClassTrib", dpsIbsCbs),
    ibsCbsOperationIndicator: text(doc, "cIndOp", dpsIbsCbs),
    ibsCbsBase: text(doc, "vBC", ibsValues),
    ibsCbsLocation: text(doc, "xLocalidadeIncid", ibsCbs) ?? text(doc, "cLocalidadeIncid", ibsCbs),
    ibsCbsRateState: text(doc, "pIBSUF", ibsUf),
    ibsCbsRateCity: text(doc, "pIBSMun", ibsMun),
    ibsCbsRateFederal: text(doc, "pCBS", ibsFed),
    ibsCbsEffectiveRateState: text(doc, "pAliqEfetUF", ibsUf),
    ibsCbsEffectiveRateCity: text(doc, "pAliqEfetMun", ibsMun),
    ibsCbsEffectiveRateFederal: text(doc, "pAliqEfetCBS", ibsFed),
    ibsCbsValueState: text(doc, "vIBSUF", ibsTotalUf),
    ibsCbsValueCity: text(doc, "vIBSMun", ibsTotalMun),
    ibsCbsValueFederal: text(doc, "vCBS", ibsTotalCbs),
    ibsCbsTotal: text(doc, "vIBSTot", ibsTotal),
    grossTotalWithIbsCbs: text(doc, "vTotNF", ibsTotals),
    discountConditional: text(doc, "vDescCond", descontos),
    discountUnconditional: text(doc, "vDescIncond", descontos),
    complementaryInformation: text(doc, "xInfComp", infoCompl),
    municipalAdditionalInformation: text(doc, "xOutInf", infNFSe),
  };
}
