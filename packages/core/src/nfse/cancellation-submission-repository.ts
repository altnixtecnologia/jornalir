import type { NfseCancellationRequest } from "@ir/types";

export type CancellationFinalStatus = "confirmed" | "rejected" | "uncertain";

export interface CancellationSubmissionRepository {
  getById(id: string): Promise<NfseCancellationRequest | null>;
  /**
   * Transicao atomica pending -> submitted. Retorna null se a solicitacao
   * ja foi reclamada por outro processo. NUNCA envia sem este claim.
   */
  claimPending(id: string): Promise<NfseCancellationRequest | null>;
  /**
   * Finaliza SOMENTE um claim submitted. Se o banco falhar apos uma
   * autorizacao remota, o estado fica submitted (ativo), sem duplicar.
   */
  settleSubmitted(id: string, result: {
    status: CancellationFinalStatus;
    responseSummary: string;
    rejectionCode?: string;
    rejectionMessage?: string;
  }): Promise<NfseCancellationRequest>;
}
