import type { NfseCancellationRequest, NfseEnvironment } from "@ir/types";
import type { CancellationRequestRepository } from "./cancellation-repository";
import type { IssuedNoteRepository } from "./issued-note-repository";
import type { NationalEventResponseEnvelope } from "./sefin-nacional-client";

export class CancellationPermissionError extends Error {}
export class IssuedNoteNotFoundError extends Error {
  constructor(issuedNoteId: string) {
    super(`NFS-e emitida não encontrada: ${issuedNoteId}.`);
  }
}
export class InvalidCancellationJustificationError extends Error {}
export class CancellationAlreadyRequestedError extends Error {
  constructor(issuedNoteId: string) {
    super(
      `Já existe uma solicitação de cancelamento ativa (pendente, enviada ou confirmada) para a NFS-e ${issuedNoteId} — ` +
        "nunca duas solicitações ativas ao mesmo tempo pra mesma nota.",
    );
  }
}
/**
 * O envio REAL do evento de cancelamento (e101101) ao Sistema Nacional
 * permanece bloqueado nesta fase — mesmo princípio de
 * RealTransmissionNotReadyError em national-nfse-provider.ts.
 *
 * (Bloco B, item 2, 25/10/2026) As peças que construiriam/assinariam/
 * transmitiriam o evento de cancelamento JÁ EXISTEM e estão testadas
 * de forma independente: `buildCancellationEventXml`/
 * `buildCancellationEventId` (event-builder.ts, estrutura confirmada
 * contra `tiposEventos_v1.01.xsd` oficial, inclusive validação XSD
 * real — ver `validatePedRegEventoAgainstOfficialXsd`),
 * `signCancellationEventXml` (signature.ts, mesmo perfil de assinatura
 * da DPS) e `SefinNacionalClient.submitCancellationEvent`/
 * `getEventsByAccessKey` (sefin-nacional-client.ts, contrato REST
 * corroborado por fontes independentes). Esta classe NUNCA as chama —
 * `submitCancellation` abaixo continua lançando
 * `CancellationSubmissionNotReadyError` incondicionalmente, ANTES de
 * qualquer chance de montar/assinar/enviar o evento. Falta, para
 * religar de verdade: (1) confirmar a composição exata do atributo
 * `Id` de `infPedReg` contra documentação autenticada (ver limitação
 * honesta documentada em event-builder.ts — o regex do XSD está
 * satisfeito, mas a semântica dos dígitos não está confirmada); (2)
 * homologação completa do fluxo de emissão em si, do qual o
 * cancelamento depende. Até lá, esta operação fica só na preparação
 * local (registro de motivo/justificativa, ver requestCancellation).
 */
export class CancellationSubmissionNotReadyError extends Error {
  constructor() {
    super(
      "Envio do cancelamento ao Sistema Nacional ainda não disponível: depende de homologação completa da emissão e confirmação do " +
        "formato exato de registro de evento (e101101) contra a documentação oficial com certificado real. A solicitação foi preparada e " +
        "registrada localmente (motivo/justificativa), mas nenhum cancelamento foi enviado.",
    );
  }
}

export interface RequestCancellationInput {
  issuedNoteId: string;
  justificationCode: 1 | 2 | 9;
  justificationText: string;
  isAdminOrOwner: boolean;
  actorProfileId?: string;
}

/**
 * Interface testável (etapa de integração final, 25/10/2026, item 3)
 * pro envio real do evento de cancelamento — `SefinNacionalClient`
 * (sefin-nacional-client.ts) já satisfaz esta forma estruturalmente
 * (seus métodos `submitCancellationEvent`/`getEventsByAccessKey` têm
 * exatamente esta assinatura), então nenhum adaptador é necessário: um
 * teste pode injetar um `SefinNacionalClient` real sobre `MockAgent`
 * direto aqui. `CancellationService` só aceita a interface via DI —
 * nunca importa `SefinNacionalClient` ela mesma, pra não acoplar a
 * classe de domínio a undici/mTLS.
 */
export interface CancellationEventProvider {
  submitCancellationEvent(signedPedRegEventoXml: string, accessKey: string, environment: NfseEnvironment): Promise<NationalEventResponseEnvelope>;
  getEventsByAccessKey(accessKey: string, environment: NfseEnvironment, filter?: { eventType?: string; sequence?: number }): Promise<string>;
}

/**
 * Implementação padrão (e única usada em produção) do
 * `CancellationEventProvider` — bloqueia incondicionalmente, mesmo
 * princípio de `RealTransmissionNotReadyError`
 * (national-nfse-provider.ts). `CancellationService` recebe esta
 * implementação por padrão; só um teste explícito injeta outra.
 */
export class CancellationEventNotReadyError extends Error {
  constructor() {
    super("Envio real do evento de cancelamento ao Sistema Nacional está bloqueado nesta fase — ver CancellationSubmissionNotReadyError.");
  }
}
export class BlockedCancellationEventProvider implements CancellationEventProvider {
  async submitCancellationEvent(): Promise<never> {
    throw new CancellationEventNotReadyError();
  }
  async getEventsByAccessKey(): Promise<never> {
    throw new CancellationEventNotReadyError();
  }
}

/**
 * Preparação do cancelamento de NFS-e (Item 5, Lote 2, Tarefa 5) —
 * identifica a nota, confere permissão, valida e registra motivo/
 * justificativa, evita solicitações repetidas. NUNCA envia o
 * cancelamento de fato (ver CancellationSubmissionNotReadyError) —
 * `submitCancellation` abaixo lança esse erro INCONDICIONALMENTE, antes
 * de tocar em `eventProvider`, mesmo que um `CancellationEventProvider`
 * real (sem bloqueio) seja injetado — a guarda não depende de o
 * provider real existir ou não (mesmo princípio de
 * `FetchNationalNfseProvider`/`SefinNacionalNationalNfseProvider` em
 * national-nfse-provider.ts). `eventProvider` existe só pra permitir
 * testar a integração ponta a ponta (ver
 * nfse-end-to-end-real-client.test.ts) sem abrir o bloqueio real.
 */
export class CancellationService {
  constructor(
    private readonly issuedNotes: IssuedNoteRepository,
    private readonly requests: CancellationRequestRepository,
    private readonly eventProvider: CancellationEventProvider = new BlockedCancellationEventProvider(),
  ) {}

  async requestCancellation(input: RequestCancellationInput): Promise<NfseCancellationRequest> {
    if (!input.isAdminOrOwner) {
      throw new CancellationPermissionError("Sem permissão para solicitar cancelamento de NFS-e — só owner/admin.");
    }

    const issuedNote = await this.issuedNotes.getById(input.issuedNoteId);
    if (!issuedNote) throw new IssuedNoteNotFoundError(input.issuedNoteId);

    // Códigos/limites vêm do XSD oficial vendorizado (TSCodJustCanc/TSMotivo) —
    // revalidados aqui como defesa em profundidade (a constraint no banco é a proteção real).
    if (![1, 2, 9].includes(input.justificationCode)) {
      throw new InvalidCancellationJustificationError("Código de justificativa inválido — use 1 (Erro na Emissão), 2 (Serviço não Prestado) ou 9 (Outros).");
    }
    const justificationText = input.justificationText.trim();
    if (justificationText.length < 15 || justificationText.length > 255) {
      throw new InvalidCancellationJustificationError("A justificativa precisa ter entre 15 e 255 caracteres.");
    }

    // Checagem rápida (idêntica em espírito à de TransmissionService.transmit) — a proteção
    // REAL contra duas solicitações ativas concorrentes é o índice único parcial do banco
    // (idx_nfse_cancellation_one_active_per_note, ver migration 20261029100900), checado no
    // catch abaixo. Sem mutex aqui de propósito: ao contrário da transmissão (que reserva
    // número de DPS e chama a API nacional), preparar uma solicitação é só uma linha local —
    // a constraint UNIQUE já é suficiente como único backstop (etapa de integração final,
    // 25/10/2026, item 5 — "garantir idempotência... incluir os eventos de cancelamento").
    const active = await this.requests.getActiveByIssuedNoteId(input.issuedNoteId);
    if (active) throw new CancellationAlreadyRequestedError(input.issuedNoteId);

    try {
      return await this.requests.create({
        issuedNoteId: input.issuedNoteId,
        justificationCode: input.justificationCode,
        justificationText,
        requestedByProfileId: input.actorProfileId,
      });
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes("idx_nfse_cancellation_one_active_per_note")) {
        throw new CancellationAlreadyRequestedError(input.issuedNoteId);
      }
      throw error;
    }
  }

  async listHistory(issuedNoteId: string): Promise<NfseCancellationRequest[]> {
    return this.requests.listByIssuedNoteId(issuedNoteId);
  }

  /** Sempre bloqueado nesta fase — ver CancellationSubmissionNotReadyError. */
  async submitCancellation(_requestId: string): Promise<never> {
    throw new CancellationSubmissionNotReadyError();
  }
}
