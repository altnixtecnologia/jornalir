import type { NfseEnvironment } from "@ir/types";
import { tag } from "./xml-utils";

/**
 * Builder do "Pedido de Registro de Evento" (TCPedRegEvt) — Bloco B,
 * item 2 (25/10/2026): cobre SÓ o evento de cancelamento (e101101),
 * que é o único evento que o Jornal IR precisa emitir como autor
 * (prestador). Os demais eventos do `xs:choice` de `TCInfPedReg`
 * (substituição, análise fiscal, confirmações/rejeições do tomador,
 * eventos de ofício da administração tributária) NÃO são deste
 * sistema — ou dependem de fluxos ainda não suportados (substituição)
 * ou são gerados pela própria administração/tomador, nunca pelo
 * prestador (ver `tiposEventos_v1.01.xsd`, `TCInfPedReg`).
 *
 * Estrutura/ordem dos elementos (`infPedReg`: tpAmb, verAplic,
 * dhEvento, CNPJAutor|CPFAutor, chNFSe, e101101{xDesc,cMotivo,xMotivo})
 * confirmada diretamente contra o XSD oficial vendorizado
 * (`xsd/prodrest-v1.01-20261020/tiposEventos_v1.01.xsd`,
 * `TCInfPedReg`/`TE101101`) — nunca inventada.
 *
 * LIMITAÇÃO HONESTA (ver também sefin-nacional-client.ts): o atributo
 * `Id` de `infPedReg` segue o padrão `TSIdPedRegEvt` —
 * `PRE[0-9]{8}(1[0-9]{14}|2[0-9A-Z]{14})[0-9]{33}` (59 caracteres). A
 * documentação do XSD descreve a composição como "PRE" + Chave de
 * Acesso NFS-e + Tipo do evento + Número do Pedido de Registro do
 * Evento, mas essa descrição em prosa NÃO bate matematicamente com os
 * tamanhos fixos do próprio regex (chave de acesso tem 50 caracteres;
 * o regex só comporta 56 depois de "PRE", numa divisão 8+15+33 que não
 * é a mesma divisão 6+14+30 da chave). Sem acesso ao Swagger
 * autenticado por mTLS, não há como confirmar a composição semântica
 * exata byte a byte. `buildCancellationEventId` abaixo gera um valor
 * que SATISFAZ o regex (reaproveitando dígitos reais da chave de
 * acesso e a mesma convenção de tipo de inscrição 1=CPF/2=CNPJ já
 * confirmada em `buildDpsId`), mas a composição exata não está
 * confirmada e deve ser revista no dia da homologação real com acesso
 * à documentação autenticada — isso NUNCA bloqueia a preparação
 * estrutural do evento (o resto do XML é confirmado), mas bloqueia,
 * sim, o envio real (ver `CancellationSubmissionNotReadyError` em
 * cancellation-service.ts, que continua lançando incondicionalmente).
 */

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export interface CancellationEventIdInput {
  accessKey: string;
  /** CNPJ do autor do evento (sempre o prestador neste sistema — nunca procurador). */
  authorCnpj: string;
  /** Número sequencial do pedido de registro de evento (nPedRegEvento) — 001 para o primeiro pedido desta nota. */
  sequence: number;
}

/** Ver limitação honesta no comentário do módulo — regex-conformante, composição semântica não confirmada oficialmente. */
export function buildCancellationEventId(input: CancellationEventIdInput): string {
  const accessKeyDigits = onlyDigits(input.accessKey).padEnd(50, "0").slice(0, 50);
  const first8 = accessKeyDigits.slice(0, 8);
  const inscriptionTypeCode = "2"; // CNPJ, mesma convenção de buildDpsId (@ir/types)
  const inscription = onlyDigits(input.authorCnpj).padStart(14, "0").slice(-14);
  const remainingAccessKeyDigits = accessKeyDigits.slice(8, 38).padEnd(30, "0").slice(0, 30);
  const sequence3 = String(input.sequence).padStart(3, "0").slice(-3);
  const tail33 = `${remainingAccessKeyDigits}${sequence3}`.padEnd(33, "0").slice(0, 33);
  return `PRE${first8}${inscriptionTypeCode}${inscription}${tail33}`;
}

export interface CancellationEventBuildInput {
  accessKey: string;
  authorCnpj: string;
  sequence: number;
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
  const id = buildCancellationEventId({ accessKey: input.accessKey, authorCnpj: input.authorCnpj, sequence: input.sequence });

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
