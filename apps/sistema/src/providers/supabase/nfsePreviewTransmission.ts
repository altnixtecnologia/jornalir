import type { SupabaseClient } from "@supabase/supabase-js";
import type { NfseIssuedNote, NfseTransmissionAttempt } from "@ir/types";
import { buildDpsId } from "@ir/types";
import { createDraftRepositorySupabase } from "./nfseDraftRepository.supabase";
import { createIssuedNoteRepositorySupabase, PREVIEW_ISSUED_NOTES } from "./nfseIssuedNoteRepository.supabase";
import { createTransmissionAttemptRepositorySupabase, PREVIEW_TRANSMISSION_ATTEMPTS } from "./nfseTransmissionAttemptRepository.supabase";

export interface PreviewTransmissionResult {
  outcome: "authorized" | "rejected";
  issuedNote?: NfseIssuedNote;
  attempt: NfseTransmissionAttempt;
  rejection?: { code: string; message: string };
}

/**
 * Simulação exclusiva de preview do "Emitir NFS-e (demonstração)" —
 * isolada aqui de propósito (nunca dentro de transmission-service.ts
 * ou national-nfse-provider.ts): não monta XML, não assina, não chama
 * nenhum NationalNfseProvider. RealTransmissionNotReadyError continua
 * bloqueando qualquer transmissão de verdade, em qualquer ambiente —
 * esta função nunca é chamada fora de SYSTEM_LOCAL_PREVIEW=1 (ver
 * guard em transmitDraftAction). Se o rascunho já tiver uma tentativa
 * rejeitada de demonstração (preview-rascunho-2), devolve ela de novo
 * em vez de criar uma nova — mantém a história do fixture coerente.
 */
export async function simulatePreviewTransmission(client: SupabaseClient, draftId: string): Promise<PreviewTransmissionResult> {
  const draft = await createDraftRepositorySupabase(client).getById(draftId);
  if (!draft) throw new Error(`Rascunho não encontrado: ${draftId}`);

  const existingRejection = PREVIEW_TRANSMISSION_ATTEMPTS.find((a) => a.draftId === draftId && a.status === "rejected");
  if (existingRejection) {
    return {
      outcome: "rejected",
      attempt: existingRejection,
      rejection: { code: existingRejection.rejectionCode ?? "UNKNOWN", message: existingRejection.rejectionMessage ?? "Rejeitada sem detalhe." },
    };
  }

  const dpsNumber = PREVIEW_ISSUED_NOTES.length + 1;
  const federalInscriptionType = draft.tomador.kind === "individual" ? ("cpf" as const) : ("cnpj" as const);
  const federalInscription = (draft.tomador.kind === "individual" ? draft.tomador.cpf : draft.tomador.cnpj) || "00000000000";

  const issuedNote = await createIssuedNoteRepositorySupabase(client).create({
    draftId: draft.id,
    issuerConfigId: "preview-issuer-config-1",
    clientId: draft.clientId,
    environment: "homologation",
    dpsSeries: "1",
    dpsNumber,
    dpsId: buildDpsId({ ibgeCode: "4216404", federalInscriptionType, federalInscription, series: "1", number: dpsNumber }),
    accessKey: `4226409${String(dpsNumber).padStart(39, "0")}`,
    nfseNumber: String(dpsNumber),
    issuedAt: new Date().toISOString(),
    competencyDate: draft.competencyDate,
    serviceValue: draft.serviceValue,
    signedDpsXml:
      '<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infDPS Id="PREVIEW-DEMO-ONLY">...(assinatura e corpo reais omitidos — este é um XML de demonstração, nunca transmitido)...</infDPS></DPS>',
  });

  const attempt = await createTransmissionAttemptRepositorySupabase(client).create({
    draftId: draft.id,
    dpsSeries: "1",
    dpsNumber,
    environment: "homologation",
    status: "authorized",
    responseSummary: `Autorizada (demonstração) — NFS-e ${issuedNote.nfseNumber}.`,
    issuedNoteId: issuedNote.id,
  });

  return { outcome: "authorized", issuedNote, attempt };
}
