import "server-only";
import { DOMParser } from "@xmldom/xmldom";
import type { NfseCancellationRequest, NfseIssuedNote } from "@ir/types";
import type { IssuedNoteRepository } from "./issued-note-repository";
import type { IssuerConfigRepository } from "./issuer-config-repository";
import type { CertificateMaterialProvider } from "./transmission-service";
import type { CancellationEventProvider } from "./cancellation-service";
import type { CancellationFinalStatus, CancellationSubmissionRepository } from "./cancellation-submission-repository";
import { buildCancellationEventXml } from "./event-builder";
import { signCancellationEventXml } from "./signature";
import { validatePedRegEventoAgainstOfficialXsd } from "./xsd-validator";

export class CancellationNotReadyError extends Error {}
export class CancellationInProgressError extends Error {}

export interface CancellationDispatchResult {
  outcome: CancellationFinalStatus;
  request: NfseCancellationRequest;
}

/** 
 * O retorno remoto do evento ainda precisa ser confirmado no Swagger
 * autenticado. Falha FECHADO: apenas um XML com chave e tipo corretos
 * pode marcar um cancelamento como confirmado.
 */
function matchesCancellationEvent(xml: string | undefined, accessKey: string): boolean {
  if (!xml || xml.length > 1024 * 1024) return false;
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    if (doc.getElementsByTagName("parsererror").length) return false;
    const keyNodes = doc.getElementsByTagName("chNFSe");
    let belongsToNote = false;
    for (let i = 0; i < keyNodes.length; i++) {
      if (keyNodes.item(i)?.textContent?.trim() === accessKey) belongsToNote = true;
    }
    return belongsToNote && (xml.includes("e101101") || xml.includes("<tpEvento>101101</tpEvento>"));
  } catch {
    return false;
  }
}

/**
 * Processador exclusivo para Produção Restrita.
 * Não utilizado em nenhuma Server Action, tela ou composicao oficial.
 *
 * 1. Gera/assina pedido, valida XSD ANTES de reclamar o pedido.
 * 2. Claim atomico pending -> submitted ANTES de qualquer POST à SEFIN.
 * 3. Em timeout, resposta malformada ou sucesso sem evidencia da chave,
 *    marca uncertain. Nunca retransmite automaticamente.
 * 4. Se falhar a persistencia apos o envio, o claim permanece submitted,
 *    impedindo duplicata; operador deve conciliar o evento.
 */
export class RestrictedCancellationDispatchService {
  constructor(
    private readonly notes: IssuedNoteRepository,
    private readonly requests: CancellationSubmissionRepository,
    private readonly issuers: IssuerConfigRepository,
    private readonly certificates: CertificateMaterialProvider,
    private readonly events: CancellationEventProvider,
  ) {}

  async submit(requestId: string, isAdminOrOwner: boolean): Promise<CancellationDispatchResult> {
    if (!isAdminOrOwner) throw new CancellationNotReadyError("Cancelamento restrito a administrador ou proprietário.");
    const request = await this.requests.getById(requestId);
    if (!request) throw new CancellationNotReadyError("Solicitação de cancelamento não encontrada.");
    if (request.status !== "pending") throw new CancellationInProgressError("Cancelamento já enviado, concluído ou incerto; concilie antes de agir.");

    const note = await this.notes.getById(request.issuedNoteId);
    if (!note || !note.accessKey) throw new CancellationNotReadyError("Nota autorizada e chave oficial são obrigatórias para cancelar.");
    if (note.environment !== "homologation") throw new CancellationNotReadyError("Cancelamento em produção real permanece bloqueado.");

    const issuer = await this.issuers.getCurrent();
    if (!issuer || issuer.id !== note.issuerConfigId || issuer.environment !== "homologation") {
      throw new CancellationNotReadyError("Prestador atual não corresponde à nota emitida em Produção Restrita.");
    }
    const certificate = await this.certificates.getActiveInfo(issuer.id);
    const cnpj = issuer.cnpj.replace(/\D/g, "");
    const validFrom = Date.parse(certificate?.validFrom ?? "");
    const validUntil = Date.parse(certificate?.validUntil ?? "");
    if (!certificate?.active || certificate.subjectCnpj !== cnpj ||
        !Number.isFinite(validFrom) || !Number.isFinite(validUntil) ||
        validFrom > Date.now() || validUntil <= Date.now()) {
      throw new CancellationNotReadyError("A1 ausente, vencido ou diferente do CNPJ do prestador.");
    }
    const material = await this.certificates.getActiveSigningMaterial(issuer.id);
    if (!material) throw new CancellationNotReadyError("Chave de assinatura A1 indisponível.");

    const rawXml = buildCancellationEventXml({
      accessKey: note.accessKey,
      authorCnpj: cnpj,
      justificationCode: request.justificationCode,
      justificationText: request.justificationText,
      environment: "homologation",
    });
    const signed = signCancellationEventXml({ xml: rawXml, ...material }).signedXml;
    const xsd = await validatePedRegEventoAgainstOfficialXsd(signed);
    if (!xsd.valid) {
      // Não remover esta guarda para contornar a divergência conhecida
      // entre TSIdPedRegEvt no XSD e a prosa do manual vigente.
      throw new CancellationNotReadyError("Evento de cancelamento não passou no XSD oficial; não foi enviado.");
    }

    const claimed = await this.requests.claimPending(requestId);
    if (!claimed) throw new CancellationInProgressError("Outro processo já iniciou este cancelamento.");

    let status: CancellationFinalStatus = "uncertain";
    let responseSummary = "Resposta de cancelamento não conclusiva. Consulte o evento na SEFIN antes de repetir.";
    let rejectionCode: string | undefined;
    let rejectionMessage: string | undefined;
    try {
      const result = await this.events.submitCancellationEvent(signed, note.accessKey, "homologation");
      if (result.status === "registered" && matchesCancellationEvent(result.eventXml, note.accessKey)) {
        status = "confirmed";
        responseSummary = "Evento e101101 confirmado para a chave da NFS-e em Produção Restrita.";
      } else if (result.status === "rejected" && result.rejection?.code && result.rejection.message) {
        status = "rejected";
        rejectionCode = result.rejection.code;
        rejectionMessage = result.rejection.message;
        responseSummary = "Evento e101101 rejeitado com detalhe explícito da SEFIN.";
      }
    } catch {
      // Pode ter havido registro remoto mesmo durante timeout.
      // Não repassar resposta HTTP bruta nem segredos aos logs.
      status = "uncertain";
    }
    // Falha desta gravação deixa o pedido no estado submitted (ativo),
    // e um novo POST é recusado pela unicidade e pelo claim condicional.
    const finalRequest = await this.requests.settleSubmitted(requestId, {
      status, responseSummary, rejectionCode, rejectionMessage,
    });
    return { outcome: status, request: finalRequest };
  }
}
