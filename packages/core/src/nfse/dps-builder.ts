import { DOMParser } from "@xmldom/xmldom";
import type { DpsBuildInput } from "@ir/types";
import { buildDpsId, NFSE_SIMPLES_NACIONAL_OPTION_CODES, NFSE_SPECIAL_TAX_REGIME_CODE_XSD_VALUES } from "@ir/types";
import { tag } from "./xml-utils";

/**
 * Builder determinístico da DPS (Parte 2A, item 6 → Parte 2C) — cobre
 * SÓ o cenário operacional inicial do Jornal IR, explicitamente
 * decidido (nunca tenta suportar todos os cenários da NFS-e Nacional):
 * - prestador PJ brasileiro, optante (ou não) do Simples Nacional;
 * - tomador PF ou PJ brasileiro;
 * - serviço comum prestado no Brasil;
 * - sem intermediário/obra/evento especial/exterior/decisão judicial-
 *   administrativa/substituição/retenções especiais/IBS-CBS.
 *
 * Os nomes/estrutura/ordem dos elementos seguem EXATAMENTE o pacote
 * oficial vendorizado (`xsd/prodrest-v1.01-20260727/`, especialmente
 * `tiposComplexos_v1.01.xsd` — `TCInfDPS`/`TCInfoPrestador`/`TCRegTrib`/
 * `TCInfoPessoa`/`TCServ`/`TCLocPrest`/`TCCServ`/`TCInfoValores`/
 * `TCInfoTributacao`/`TCTribMunicipal`/`TCTribTotal`) — confirmado por
 * `xsd-validator.test.ts` (fixture completa do cenário PASSA de
 * verdade em `validateDpsAgainstOfficialXsd`).
 */

function federalInscriptionTag(kind: "individual" | "company", cpf: string | undefined, cnpj: string | undefined): string {
  return kind === "individual" ? tag("CPF", cpf) : tag("CNPJ", cnpj);
}

/** Hora fiscal de São João do Sul/SC: instante UTC convertido para UTC-03:00.
 * Nunca apenas substituir o sufixo "Z" por "-03:00" — isso alteraria
 * o instante em três horas e pode trocar o dia fiscal próximo à meia-noite.
 * Hora oficial vigente de SC em 2026: UTC-03, sem horário de verão. */
export function formatDhEmi(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new Error("Data de emissão inválida.");
  const localWallClock = new Date(date.getTime() - 3 * 60 * 60 * 1000)
    .toISOString().replace(/\.\d{3}Z$/, "");
  return `${localWallClock}-03:00`;
}

/** Remove tudo que não é dígito — formatação de entrada (ex.: NBS digitado como "1.1406.19.00"), nunca inventa/completa o valor. */
function onlyDigits(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  return digits || undefined;
}

/**
 * `prest` (`TCInfoPrestador`) — CNPJ/IM/xNome + `regTrib` (obrigatório
 * no XSD). `regTrib` só é emitido quando AMBOS `opSimpNac`/`regEspTrib`
 * estiverem configurados no prestador (Configurações NFS-e) — nunca um
 * default assumido; se faltar, a DPS fica estruturalmente incompleta
 * DE PROPÓSITO (a validação XSD real rejeita, ver xsd-validator.ts;
 * readiness.ts aponta exatamente o que falta ao admin).
 */
function buildPrest(issuer: DpsBuildInput["issuer"]): string {
  const opSimpNac = issuer.simplesNacionalOption ? NFSE_SIMPLES_NACIONAL_OPTION_CODES[issuer.simplesNacionalOption] : undefined;
  const regEspTrib = issuer.specialTaxRegimeCode ? NFSE_SPECIAL_TAX_REGIME_CODE_XSD_VALUES[issuer.specialTaxRegimeCode] : undefined;
  const regTribInner = [tag("opSimpNac", opSimpNac), tag("regEspTrib", regEspTrib)].join("");
  const regTrib = regTribInner ? `<regTrib>${regTribInner}</regTrib>` : "";

  return [tag("CNPJ", issuer.cnpj), tag("IM", issuer.municipalRegistration), tag("xNome", issuer.companyName), regTrib].join("");
}

/**
 * `toma` (`TCInfoPessoa`) — só os campos diretos (CPF/CNPJ, IM, xNome,
 * email); NUNCA o grupo `end` (endereço) — é opcional no XSD e exigiria
 * modelar a estrutura `TCEndereco`/`endNac` completa, que este cenário
 * inicial não precisa (item 8: "não exigir campo opcional só porque
 * existe no schema"). Endereço do tomador fica fora da DPS por ora.
 */
function buildToma(tomador: DpsBuildInput["tomador"]): string {
  return [
    federalInscriptionTag(tomador.kind, tomador.cpf, tomador.cnpj),
    tag("IM", tomador.municipalRegistration),
    tag("xNome", tomador.name),
    tag("email", tomador.email),
  ].join("");
}

/**
 * `serv` (`TCServ`) — só `locPrest` (serviço sempre prestado no
 * Brasil, nunca `cPaisPrestacao`) e `cServ` (código nacional/municipal/
 * NBS e a descrição digitada manualmente — NUNCA autopreenchida pelo
 * perfil). `cTribMun`/`cNBS` só aparecem se o perfil tiver informado
 * (campos opcionais no XSD).
 */
function buildServ(fiscal: DpsBuildInput["fiscal"], issuerIbgeCode: string, serviceDescription: string): string {
  const locPrestacao = fiscal.locationIbgeCode || issuerIbgeCode;
  const locPrest = `<locPrest>${tag("cLocPrestacao", locPrestacao)}</locPrest>`;
  const cServ = [tag("cTribNac", onlyDigits(fiscal.cTribNac)), tag("cTribMun", onlyDigits(fiscal.cTribMun)), tag("xDescServ", serviceDescription), tag("cNBS", onlyDigits(fiscal.cNBS))].join("");
  return `${locPrest}<cServ>${cServ}</cServ>`;
}

/**
 * `valores` (`TCInfoValores`) — `vServPrest.vServ` é sempre o valor
 * informado NAQUELA emissão (nunca alterado). `trib` usa só códigos de
 * CLASSIFICAÇÃO (nunca uma alíquota): `tribISSQN="1"` (operação
 * tributável — cenário "serviço comum", sem imunidade/exportação/não
 * incidência) e `tpRetISSQN="1"` (não retido — cenário "sem retenções
 * especiais nesta fase"). `totTrib.indTotTrib="0"` é o ÚNICO valor que
 * o próprio XSD permite para esse campo (`TSTipoIndTotTrib`: enumeração
 * de um único valor) — nunca uma alíquota/valor estimado de tributos
 * (Decreto 8.264/2014), por isso nenhuma informação de alíquota é
 * necessária em nenhum lugar desta DPS (ver @ir/types — issqnRate foi
 * removido de propósito, ver ajuste final da Parte 2B).
 */
function buildValores(serviceValue: number): string {
  const vServPrest = `<vServPrest>${tag("vServ", serviceValue.toFixed(2))}</vServPrest>`;
  const tribMun = `<tribMun>${tag("tribISSQN", "1")}${tag("tpRetISSQN", "1")}</tribMun>`;
  const totTrib = `<totTrib>${tag("indTotTrib", "0")}</totTrib>`;
  return `${vServPrest}<trib>${tribMun}${totTrib}</trib>`;
}

/**
 * Monta o XML da DPS (ainda NÃO assinado) a partir dos dados já
 * existentes no rascunho/configuração — nunca inventa valor, alíquota
 * ou código fiscal; descrição/competência/valor são SEMPRE os
 * informados naquela emissão (nunca substituídos pelo perfil).
 */
export function buildDpsXml(input: DpsBuildInput): string {
  const dhEmi = formatDhEmi(new Date());
  // Id do infDPS (ver buildDpsId em @ir/types) — referenciado pela
  // assinatura XML via Reference URI="#"+Id (ver signature.ts).
  const dpsId = buildDpsId({
    ibgeCode: input.issuer.ibgeCode,
    federalInscriptionType: "cnpj",
    federalInscription: input.issuer.cnpj,
    series: input.dpsSeries,
    number: input.dpsNumber,
  });

  const prest = buildPrest(input.issuer);
  const toma = buildToma(input.tomador);
  const serv = buildServ(input.fiscal, input.issuer.ibgeCode, input.serviceDescription);
  const valores = buildValores(input.serviceValue);

  // Ordem exata conforme TCInfDPS (xsd/prodrest-v1.01-20261020/tiposComplexos_v1.01.xsd).
  // `cMotivoEmisTI`/`chNFSeRej` continuam omitidos (minOccurs=0; só se
  // aplicam quando o emitente é Tomador/Intermediário ou há rejeição
  // prévia — este sistema sempre emite como Prestador, tpEmit="1").
  // `finNFSe` é NOVO nesta revisão do schema (antes não fazia parte da
  // sequência de infDPS) e é OBRIGATÓRIO (sem minOccurs="0") com um
  // único valor válido em TSRTCFinNFSe: "0" (NFS-e regular) — não é uma
  // suposição fiscal, é o único literal aceito pelo XSD para o caso que
  // este sistema emite.
  const infDps = [
    tag("tpAmb", input.environment === "production" ? "1" : "2"),
    tag("dhEmi", dhEmi),
    tag("verAplic", "JornalIR-1.0"),
    tag("serie", input.dpsSeries),
    tag("nDPS", String(input.dpsNumber)),
    tag("dCompet", input.competencyDate),
    tag("tpEmit", "1"),
    tag("finNFSe", "0"),
    tag("cLocEmi", input.issuer.ibgeCode),
    `<prest>${prest}</prest>`,
    `<toma>${toma}</toma>`,
    `<serv>${serv}</serv>`,
    `<valores>${valores}</valores>`,
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infDPS Id="${dpsId}">${infDps}</infDPS></DPS>`;
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
 * significa carregar o pacote de esquemas oficial vigente e rodar um
 * validador XML real contra ele — ver `validateDpsAgainstOfficialXsd`
 * em xsd-validator.ts (Parte 2B/2C). Enquanto a DPS gerada aqui não
 * passar NESSA validação real, a transmissão continua bloqueada (ver
 * `RealTransmissionNotReadyError` em national-nfse-provider.ts).
 */
export function validateDpsXmlStructure(xml: string): DpsXmlValidationResult {
  const issues: string[] = [];
  const requiredElements = [
    "<DPS",
    "<infDPS ",
    "<prest>",
    "<toma>",
    "<serv>",
    "<valores>",
    "<tpAmb>",
    "<dCompet>",
    "<serie>",
    "<nDPS>",
    "<xDescServ>",
    "<vServ>",
    "<locPrest>",
    "<cServ>",
    "<trib>",
    "<tribMun>",
    "<totTrib>",
  ];
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

/**
 * Extrai `nNFSe`/`dhProc` de um XML de NFS-e já confirmado (auditoria
 * funcional, 26/10/2026 — usado por
 * `TransmissionService.resolvePendingAttemptWithAccessKey()` pra
 * completar manualmente uma tentativa "pending"/"uncertain" depois de
 * a chave de acesso ter sido confirmada por um canal humano/fora de
 * banda, nunca parseada automaticamente de um formato não confirmado).
 * MESMOS nomes de campo já confirmados e testados em
 * `sefin-nacional-client.ts` (`extractNfseFields`, caminho real de
 * autorização) — nunca um nome novo/inventado. Fail-closed: lança erro
 * se os campos obrigatórios não existirem.
 */
export function extractNfseNumberAndIssuedAt(nfseXml: string): { nfseNumber: string; issuedAt: string } {
  const doc = new DOMParser().parseFromString(nfseXml, "text/xml");
  const nNFSe = doc.getElementsByTagName("nNFSe")[0]?.textContent?.trim();
  const dhProc = doc.getElementsByTagName("dhProc")[0]?.textContent?.trim();
  if (!nNFSe || !dhProc) {
    throw new Error("XML da NFS-e sem nNFSe/dhProc — não corresponde ao esquema oficial esperado, nunca usado pra completar um registro fiscal.");
  }
  return { nfseNumber: nNFSe, issuedAt: dhProc };
}

/** Extrai o CNPJ do prestador na DPS/infDPS/prest (primeiro CNPJ do documento) — mesmo
 * princípio de `assertSamePrestador` em sefin-nacional-client.ts, aplicado aqui pra
 * confirmar que uma NFS-e consultada manualmente pertence ao MESMO prestador da DPS
 * original antes de aceitar a regularização. */
export function extractPrestadorCnpj(xml: string): string | undefined {
  return new DOMParser().parseFromString(xml, "text/xml").getElementsByTagName("CNPJ")[0]?.textContent?.trim() || undefined;
}

/**
 * Extrai a IDENTIDADE da DPS embutida numa NFS-e autorizada (atributo
 * `Id` de `infDPS`, formado por `buildDpsId` — único por município +
 * tipo/inscrição + série + número — e `tpAmb`, formado no momento da
 * emissão). Auditoria funcional (26/10/2026) — `resolvePendingAttemptWithAccessKey`
 * usa isto pra confirmar que a NFS-e encontrada pela chave de acesso
 * informada corresponde EXATAMENTE à DPS original da tentativa que
 * está sendo regularizada (mesmo prestador NÃO basta: duas DPS reais
 * do MESMO CNPJ têm `Id`s diferentes — confirmar o `Id` impede que a
 * chave de acesso de OUTRA nota do mesmo prestador seja aceita por
 * engano). Fail-closed: `dpsId`/`tpAmb` ausentes viram `undefined`,
 * nunca um valor inventado — quem chama decide que isso é motivo de
 * recusa.
 */
export function extractEmbeddedDpsIdentity(nfseXml: string): { dpsId?: string; tpAmb?: string } {
  const doc = new DOMParser().parseFromString(nfseXml, "text/xml");
  const infDPS = doc.getElementsByTagName("infDPS")[0];
  if (!infDPS) return {};
  const dpsId = infDPS.getAttribute("Id")?.trim() || undefined;
  const tpAmb = doc.getElementsByTagName("tpAmb")[0]?.textContent?.trim() || undefined;
  return { dpsId, tpAmb };
}
