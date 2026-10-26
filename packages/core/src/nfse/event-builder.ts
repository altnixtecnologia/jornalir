import type { NfseEnvironment } from "@ir/types";
import { tag } from "./xml-utils";

/**
 * Builder do "Pedido de Registro de Evento" (TCPedRegEvt) — Bloco B,
 * item 2 (25/10/2026, revisado 25/10/2026 na etapa de integração
 * final): cobre SÓ o evento de cancelamento (e101101), que é o único
 * evento que o Jornal IR precisa emitir como autor (prestador). Os
 * demais eventos do `xs:choice` de `TCInfPedReg` (substituição, análise
 * fiscal, confirmações/rejeições do tomador, eventos de ofício da
 * administração tributária) NÃO são deste sistema — ou dependem de
 * fluxos ainda não suportados (substituição) ou são gerados pela
 * própria administração/tomador, nunca pelo prestador (ver
 * `tiposEventos_v1.01.xsd`, `TCInfPedReg`).
 *
 * Estrutura/ordem dos elementos (`infPedReg`: tpAmb, verAplic,
 * dhEvento, CNPJAutor|CPFAutor, chNFSe, e101101{xDesc,cMotivo,xMotivo})
 * confirmada diretamente contra o XSD oficial vendorizado
 * (`xsd/prodrest-v1.01-20261020/tiposEventos_v1.01.xsd`,
 * `TCInfPedReg`/`TE101101`) e contra o "Manual de Integração Webservice
 * NFS-e Padrão Nacional" oficial (v1.01, revisado 03/08/2026) — nunca
 * inventada. O manual confirma inclusive que o campo `nPedRegEvento`
 * NÃO faz parte de `infPedReg`/`TCInfPedReg` (consistente com o XSD
 * vendorizado, que também não o tem) — ele só existe dentro da
 * composição do `Id` do EVENTO (`TSIdEvento`, gerado pela própria
 * SEFIN na resposta, nunca por nós) e do contador `nSeqEvento` em
 * `TCInfEvento`.
 *
 * COMPOSIÇÃO DO `Id` DE `infPedReg` (`TSIdPedRegEvt`, 59 caracteres,
 * prefixo "PRE") — CORROBORADA por 3 fontes independentes nesta
 * revisão: (1) o próprio Manual de Integração oficial, prosa literal:
 * "'PRE' + Chave de Acesso NFS-e (50) + Tipo do evento (6)"; (2) um
 * post no fórum ProjetoACBr relatando que, após a Nota Técnica/Anexo
 * II de 27-28/12/2025, o campo `nPedRegEvento` foi REMOVIDO dessa
 * composição (antes eram 62 caracteres, com o número do pedido; hoje
 * são 59, sem ele); (3) o CHANGELOG/PR #10 do projeto open-source
 * `Quantum-Tecnology/nfse-nacional` ("fix(xsd): XSDs oficiais da v1.01
 * ... e cancelamento sem nPedRegEvento"), que descreve exatamente a
 * mesma mudança e a mesma fórmula final (`PRE[0-9]{56}`, ou seja PRE +
 * chave(50) + tipo do evento(6)). As 3 fontes convergem — isso
 * SUBSTITUI a tentativa anterior desta função (que reaproveitava a
 * convenção de `buildDpsId`, nunca confirmada para este campo
 * especificamente).
 *
 * RESSALVA HONESTA que permanece (documentada pelo próprio projeto
 * Quantum-Tecnology, não inventada aqui): o regex do XSD vendorizado
 * para `TSIdPedRegEvt` — `PRE[0-9]{8}(1[0-9]{14}|2[0-9A-Z]{14})[0-9]{33}`
 * — tem uma estrutura de classes de caracteres (dígito-dígito-flag+
 * alfanumérico-dígito) que só por coincidência bate com a concatenação
 * literal "PRE"+chave+tipo quando o 7º caractere da chave de acesso
 * (1º caractere do seu trecho alfanumérico de 14) for literalmente "1"
 * ou "2" — o próprio changelog do Quantum-Tecnology chama isso de
 * contradição no XSD oficial. Não é um erro desta implementação: é uma
 * inconsistência confirmada entre a PROSA do manual (que seguimos,
 * porque é o que as implementações reais usam) e o REGEX do XSD vigente
 * — resolver isso de vez depende de testar contra o validador real da
 * SEFIN em homologação, o que esta fase não faz.
 */

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Código de evento (6 caracteres) usado na composição do Id — "101101" pro cancelamento (TE101101/"e101101"), nunca um valor solto. */
const CANCELLATION_EVENT_CODE = "101101";

export interface CancellationEventIdInput {
  /** Chave de Acesso NFS-e (TSChaveNFSe, 50 caracteres) — usada EXATAMENTE como veio, nunca só os dígitos (o trecho do meio é alfanumérico). */
  accessKey: string;
}

/** Ver "COMPOSIÇÃO DO Id" no comentário do módulo — "PRE" + chave de acesso (50) + código do evento (6) = 59 caracteres. */
export function buildCancellationEventId(input: CancellationEventIdInput): string {
  const accessKey = input.accessKey.padEnd(50, "0").slice(0, 50);
  return `PRE${accessKey}${CANCELLATION_EVENT_CODE}`;
}

export interface CancellationEventBuildInput {
  accessKey: string;
  authorCnpj: string;
  justificationCode: 1 | 2 | 9;
  justificationText: string;
  environment: NfseEnvironment;
  /** Data/hora do evento (UTC) — injetada para determinismo em teste; produção usa `new Date()`. */
  now?: Date;
}

/**
 * Monta o XML (ainda NÃO assinado) do `pedRegEvento` de cancelamento
 * — equivalente a `buildDpsXml` (dps-builder.ts), mesmo princípio:
 * nunca inventa valor/motivo, usa exatamente o que foi informado pelo
 * solicitante (ver `CancellationService.requestCancellation`).
 */
export function buildCancellationEventXml(input: CancellationEventBuildInput): string {
  // TSDateTimeUTC exige TZD numérico (+hh:mm/-hh:mm) — "Z" literal não casa com o pattern do XSD.
  const dhEvento = (input.now ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "+00:00");
  const id = buildCancellationEventId({ accessKey: input.accessKey });

  const e101101 = [
    `<xDesc>Cancelamento de NFS-e</xDesc>`,
    tag("cMotivo", String(input.justificationCode)),
    tag("xMotivo", input.justificationText),
  ].join("");

  const infPedReg = [
    tag("tpAmb", input.environment === "production" ? "1" : "2"),
    tag("verAplic", "JornalIR-1.0"),
    tag("dhEvento", dhEvento),
    tag("CNPJAutor", onlyDigits(input.authorCnpj)),
    tag("chNFSe", input.accessKey),
    `<e101101>${e101101}</e101101>`,
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8"?><pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infPedReg Id="${id}">${infPedReg}</infPedReg></pedRegEvento>`;
}

export interface CancellationEventXmlValidationResult {
  structurallyValid: boolean;
  issues: string[];
}

/**
 * Validação ESTRUTURAL (nunca "validação XSD" — ver mesmo aviso em
 * `validateDpsXmlStructure`, dps-builder.ts). Validação XSD REAL fica
 * em `validatePedRegEventoAgainstOfficialXsd` (xsd-validator.ts).
 */
export function validateCancellationEventXmlStructure(xml: string): CancellationEventXmlValidationResult {
  const issues: string[] = [];
  const requiredElements = ["<pedRegEvento", "<infPedReg ", "<tpAmb>", "<dhEvento>", "<chNFSe>", "<e101101>", "<cMotivo>", "<xMotivo>"];
  for (const element of requiredElements) {
    if (!xml.includes(element)) issues.push(`Elemento obrigatório ausente: ${element}`);
  }
  if (!xml.trim().startsWith("<?xml")) issues.push("XML sem declaração de versão/encoding.");
  return { structurallyValid: issues.length === 0, issues };
}
