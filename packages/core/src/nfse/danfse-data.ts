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

/** Apenas filhos diretos dos grupos oficiais; uma tag aninhada em outro
 * grupo não pode mascarar a ausência do campo obrigatório da NFS-e. */
function directChild(scope: XmlElement | undefined | null, tagName: string): XmlElement | undefined {
  if (!scope) return undefined;
  for (let child = scope.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1 && (child as XmlElement).localName === tagName) return child as XmlElement;
  }
  return undefined;
}

function directText(scope: XmlElement | undefined | null, tagName: string): string | undefined {
  const value = directChild(scope, tagName)?.textContent?.trim();
  return value || undefined;
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
  municipality?: string;
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
  /** Ambiente gerador informado em infNFSe/ambGer, sem presumir o codigo. */
  environmentGenerator?: string;
  statusCode: string;
  statusLabel: string;
  issuerLabel: string;
  purposeLabel: string;
  isHomologation: boolean;
  prestador: DanfsePessoaData;
  tomador?: DanfsePessoaData;
  /** indDest=0 confirma destino idêntico ao tomador; ausência NÃO presume igualdade. */
  destinatarioEhTomador?: boolean;
  destinatario?: DanfsePessoaData;
  intermediario?: DanfsePessoaData;
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
  issqnImmunityType?: string;
  issqnSuspensionType?: string;
  issqnSuspensionProcess?: string;
  issqnMunicipalBenefitType?: string;
  issqnBenefitCalculation?: string;
  issqnTotalDeductions?: string;
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
  ibsCbsExclusions?: string;
  ibsCbsRateReductionState?: string;
  ibsCbsRateReductionCity?: string;
  ibsCbsRateReductionFederal?: string;
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
  purchaseOrderNumber?: string;
  municipalAdditionalInformation?: string;
  /** Tributos aproximados extraídos, nunca estimados neste documento. */
  taxApproxTotals?: string;
  /** Campos complementares do XML autorizado, para ordem do Anexo I. */
  replacedNoteAccessKey?: string;
  referencedDocument?: string;
  constructionCode?: string;
  propertyRegistration?: string;
  eventActivityCode?: string;
  technicalDocumentId?: string;
  purchaseOrderItem?: string;
}

function extractAddress(doc: XmlDoc, scope: XmlElement | undefined): { address?: string; state?: string; municipality?: string; ibgeCode?: string; zipCode?: string } {
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
    municipality: text(doc, "xMun", endScope),
    zipCode: text(doc, "CEP", endScope),
  };
}

function extractPessoa(doc: XmlDoc, scope: XmlElement | undefined, context: string, required: boolean): DanfsePessoaData | undefined {
  if (!scope) {
    if (required) throw new DanfseDataError(`Grupo obrigatório ausente no XML da NFS-e (${context}).`);
    return undefined;
  }
  const federalInscription = directText(scope, "CNPJ") ?? directText(scope, "CPF") ?? directText(scope, "NIF");
  const name = directText(scope, "xNome");
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
export function extractDanfseData(issuedNote: Pick<NfseIssuedNote, "environment" | "accessKey" | "nfseNumber" | "issuedAt" | "competencyDate" | "serviceValue" | "nfseXml" | "dpsId" | "dpsNumber" | "dpsSeries">): DanfseData {
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
  // Evitar payloads extensos/entidades que não fazem parte do XML fiscal.
  if (Buffer.byteLength(issuedNote.nfseXml, "utf8") > 2 * 1024 * 1024 ||
      /<!(?:DOCTYPE|ENTITY)\b/i.test(issuedNote.nfseXml)) {
    throw new DanfseDataError("XML fiscal excede o limite de segurança ou contém entidades não permitidas.");
  }
  let doc: XmlDoc;
  try {
    doc = new DOMParser().parseFromString(issuedNote.nfseXml, "text/xml");
  } catch {
    throw new DanfseDataError("XML da NFS-e inválido — não foi possível interpretar o documento.");
  }
  if (doc.documentElement?.localName !== "NFSe" || doc.getElementsByTagName("parsererror").length) {
    throw new DanfseDataError("O documento informado não é um XML de NFS-e autorizada válido.");
  }
  const infNFSe = directChild(doc.documentElement, "infNFSe");
  if (!infNFSe) throw new DanfseDataError("Elemento infNFSe ausente — o XML não corresponde ao esquema oficial de NFS-e autorizada.");

  const dps = directChild(infNFSe, "DPS");
  const infDPS = directChild(dps, "infDPS");
  if (!infDPS) throw new DanfseDataError("DPS original (DPS/infDPS) ausente dentro da NFS-e — necessária pra competência, tomador e serviço.");

  const prestador = extractPessoa(doc, directChild(infNFSe, "emit"), "emit — prestador", true)!;
  const tomador = extractPessoa(doc, directChild(infDPS, "toma"), "infDPS/toma — tomador", false);
  const grupoIntermediario = directChild(infDPS, "interm");
  // Grupo presente mas incompleto nunca deve ser convertido em declaração
  // falsa de que não existe intermediário.
  const intermediario = grupoIntermediario
    ? extractPessoa(doc, grupoIntermediario, "infDPS/interm — intermediário", true)
    : undefined;

  // Os campos de exibição vêm de colunas persistidas após autorização.
  // Antes de gerar DANFSe, conferir vínculo com XML e DPS originais:
  // não imprimir identidade/número/valor de outra nota por associação incorreta.
  const xmlDpsId = infDPS.getAttribute("Id")?.trim();
  if (!issuedNote.dpsId || xmlDpsId !== issuedNote.dpsId) {
    throw new DanfseDataError("DPS embutida não corresponde ao identificador da nota registrada; DANFSe bloqueado.");
  }
  const xmlNumber = requireText("nNFSe", directText(infNFSe, "nNFSe"), "infNFSe");
  if (xmlNumber !== issuedNote.nfseNumber) {
    throw new DanfseDataError("Número da NFS-e armazenado diverge do XML autorizado.");
  }
  const xmlProcessedAt = requireText("dhProc", directText(infNFSe, "dhProc"), "infNFSe");
  const xmlTime = Date.parse(xmlProcessedAt);
  const storedTime = Date.parse(issuedNote.issuedAt);
  if (!Number.isFinite(xmlTime) || !Number.isFinite(storedTime) || xmlTime !== storedTime) {
    throw new DanfseDataError("Data da autorização armazenada diverge do instante registrado no XML.");
  }
  if (directText(infDPS, "dCompet") !== issuedNote.competencyDate ||
      directText(infDPS, "serie") !== issuedNote.dpsSeries ||
      directText(infDPS, "nDPS") !== String(issuedNote.dpsNumber)) {
    throw new DanfseDataError("Competência, série ou número da DPS divergem do XML fiscal autorizado.");
  }
  const originalValues = directChild(infDPS, "valores");
  const serviceValueText = directText(directChild(originalValues, "vServPrest"), "vServ");
  const serviceValueInXml = serviceValueText ? Number(serviceValueText) : Number.NaN;
  if (!Number.isFinite(serviceValueInXml) || !Number.isFinite(issuedNote.serviceValue) ||
      Math.round(serviceValueInXml * 100) !== Math.round(issuedNote.serviceValue * 100)) {
    throw new DanfseDataError("Valor do serviço diverge entre a DPS autorizada e os dados armazenados.");
  }
  const prestadorDpsCnpj = directText(directChild(infDPS, "prest"), "CNPJ");
  const emitenteCnpj = directText(directChild(infNFSe, "emit"), "CNPJ");
  if (!prestadorDpsCnpj || !emitenteCnpj || prestadorDpsCnpj !== emitenteCnpj) {
    throw new DanfseDataError("CNPJ do prestador na DPS diverge do emitente na NFS-e autorizada.");
  }

  const serv = directChild(infDPS, "serv");
  const valoresNFSe = directChild(infNFSe, "valores");
  const prest = directChild(infDPS, "prest");
  const regTrib = directChild(prest, "regTrib");
  const dpsValores = directChild(infDPS, "valores");
  const dpsTrib = dpsValores?.getElementsByTagName("trib")[0];
  const tribMun = dpsTrib?.getElementsByTagName("tribMun")[0];
  const tribFed = dpsTrib?.getElementsByTagName("tribFed")[0];
  const exigSusp = directChild(tribMun, "exigSusp");
  const municipalBenefit = directChild(tribMun, "BM");
  const municipalDeductions = directChild(dpsValores, "vDedRed");
  const pisCofins = tribFed?.getElementsByTagName("piscofins")[0];
  const descontos = dpsValores?.getElementsByTagName("vDescCondIncond")[0];
  const infoCompl = directChild(serv, "infoCompl");
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
  const approximateTaxes = directChild(dpsTrib, "totTrib");
  // NT 008 v1.02: vTotTrib/pTotTrib sob trib/totTrib, não filhos diretos.
  const approximateMonetary = directChild(approximateTaxes, "vTotTrib");
  const approximatePercentage = directChild(approximateTaxes, "pTotTrib");
  const replacementGroup = directChild(infDPS, "subst");
  const constructionGroup = directChild(serv, "obra");
  const eventGroup = directChild(serv, "atvEvento");
  const propertyGroup = directChild(dpsIbsCbs, "imovel");
  const dpsIbsCbs = infDPS.getElementsByTagName("IBSCBS")[0];
  // No XSD de Produção Restrita, indDest=0 comprova que o destinatário
  // é o próprio tomador; indDest=1 identifica um destinatário diferente
  // no grupo IBSCBS/dest. Sem indDest, o PDF NÃO pode afirmar igualdade.
  const indicadorDestino = text(doc, "indDest", dpsIbsCbs);
  const grupoDestinatario = dpsIbsCbs?.getElementsByTagName("dest")[0];
  if (indicadorDestino === "0" && (!tomador || grupoDestinatario)) {
    throw new DanfseDataError("indDest=0 não corresponde ao tomador ou contém destinatário separado — DANFSe bloqueado.");
  }
  if (indicadorDestino === "1" && !grupoDestinatario) {
    throw new DanfseDataError("indDest=1 sem identificação do destinatário — DANFSe bloqueado.");
  }
  if (indicadorDestino && indicadorDestino !== "0" && indicadorDestino !== "1") {
    throw new DanfseDataError("Indicador indDest desconhecido no XML fiscal.");
  }
  const destinatario = grupoDestinatario
    ? extractPessoa(doc, grupoDestinatario, "IBSCBS/dest — destinatário", true)
    : undefined;

  const tpAmb = requireText("tpAmb", directText(infDPS, "tpAmb"), "infDPS");
  if (tpAmb !== "1" && tpAmb !== "2") throw new DanfseDataError(`tpAmb=${tpAmb} não reconhecido na DPS.`);
  if ((tpAmb === "2") !== (issuedNote.environment === "homologation")) {
    throw new DanfseDataError("Ambiente da DPS não corresponde ao ambiente registrado da nota.");
  }
  const cStat = requireText("cStat", directText(infNFSe, "cStat"), "infNFSe");
  const statusLabel = STAT_LABELS[cStat];
  if (!statusLabel) throw new DanfseDataError(`Situação cStat=${cStat} sem descrição validada no leiaute nacional.`);
  // Emitente e finalidade vêm da DPS embutida, não de nomes ou textos fixos do PDF.
  const tpEmit = requireText("tpEmit", directText(infDPS, "tpEmit"), "infDPS");
  const issuerLabel = ({ "1": "Prestador", "2": "Tomador", "3": "Intermediário" } as Record<string, string>)[tpEmit];
  if (!issuerLabel) throw new DanfseDataError(`Emitente tpEmit=${tpEmit} não reconhecido no XML autorizado.`);
  const finNFSe = requireText("finNFSe", directText(infDPS, "finNFSe"), "infDPS");
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
    dpsIssuedAt: requireText("dhEmi", directText(infDPS, "dhEmi"), "infDPS/dhEmi"),
    emitterMunicipality: text(doc, "xLocEmi", infNFSe),
    environmentGenerator: directText(infNFSe, "ambGer"),
    statusCode: cStat,
    statusLabel,
    issuerLabel,
    purposeLabel: "NFS-e regular",
    isHomologation: tpAmb === "2",
    prestador,
    tomador,
    destinatarioEhTomador: indicadorDestino === "0",
    destinatario,
    intermediario,
    serviceDescription: requireText("xDescServ", directText(directChild(serv, "cServ"), "xDescServ"), "infDPS/serv/cServ/xDescServ"),
    nationalServiceCode: directText(directChild(serv, "cServ"), "cTribNac"),
    municipalServiceCode: directText(directChild(serv, "cServ"), "cTribMun"),
    serviceLocationIbgeCode: directText(directChild(serv, "locPrest"), "cLocPrestacao"),
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
    issqnImmunityType: directText(tribMun, "tpImunidade"),
    issqnSuspensionType: directText(exigSusp, "tpSusp"),
    issqnSuspensionProcess: directText(exigSusp, "nProcesso"),
    issqnMunicipalBenefitType: directText(valoresNFSe, "tpBM"),
    issqnBenefitCalculation: directText(valoresNFSe, "vCalcBM") ?? directText(municipalBenefit, "vRedBCBM"),
    issqnTotalDeductions: directText(municipalDeductions, "vDR") ?? directText(valoresNFSe, "vCalcDR"),
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
    ibsCbsRateReductionState: text(doc, "pRedAliqUF", ibsUf),
    ibsCbsRateReductionCity: text(doc, "pRedAliqMun", ibsMun),
    ibsCbsRateReductionFederal: text(doc, "pRedAliqCBS", ibsFed),
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
    complementaryInformation: directText(infoCompl, "xInfComp"),
    purchaseOrderNumber: directText(infoCompl, "xPed"),
    municipalAdditionalInformation: text(doc, "xOutInf", infNFSe),
    replacedNoteAccessKey: directText(replacementGroup, "chSubstda"),
    referencedDocument: directText(infoCompl, "docRef"),
    constructionCode: directText(constructionGroup, "cObra"),
    propertyRegistration: directText(propertyGroup, "inscImobFisc"),
    eventActivityCode: directText(eventGroup, "idAtvEvt"),
    technicalDocumentId: directText(infoCompl, "idDocTec"),
    purchaseOrderItem: directText(directChild(infoCompl, "gItemPed"), "xItemPed"),
    taxApproxTotals: (() => {
      const select = (monetary: string, percentage: string): string | undefined => {
        const v = directText(approximateMonetary, monetary);
        const p = directText(approximatePercentage, percentage);
        if (v !== undefined && Number.isFinite(Number(v))) return "R$ " +
          Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (p !== undefined && Number.isFinite(Number(p))) return p.replace(".", ",") + "%";
        return undefined;
      };
      const federal = select("vTotTribFed", "pTotTribFed");
      const state = select("vTotTribEst", "pTotTribEst");
      const municipal = select("vTotTribMu", "pTotTribMu");
      if (federal === undefined && state === undefined && municipal === undefined) return undefined;
      return `Federais: ${federal ?? "-"}; Estaduais: ${state ?? "-"}; Municipais: ${municipal ?? "-"}`;
    })(),
  };
}
