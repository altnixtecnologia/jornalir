import "server-only";
import type { createSupabaseAdminClient } from "../supabase/admin";
import type { PlacedField } from "./signaturePlacement";

/**
 * Etapa 3B: a posição visual do CONTRATANTE vem da mesma rodada da EMPRESA
 * que produziu o PDF aceito. Nunca posicionar uma imagem antes do aceite.
 *
 * O primeiro signatário externo recebe a caixa "contratante-1" e as rubricas
 * reservadas no PDF preparado. Os demais mantêm a folha individual de aceite
 * cumulativa, sem cobrir uma rubrica/assinatura já gravada.
 */
export interface ExternalSignatureAppearance {
  fields: PlacedField[];
  hasPlaceholders: boolean;
}

export function clientFieldsForBase(
  round: { final_sha256: string; layout_mode: string; layout_fields: unknown },
  baseSha256: string,
): ExternalSignatureAppearance | null {
  if (!/^[0-9a-f]{64}$/.test(baseSha256) || !/^[0-9a-f]{64}$/.test(round.final_sha256)) {
    throw new Error("Hash do documento de assinatura inválido.");
  }
  // Depois da primeira assinatura externa, a base é cumulativa e já contém
  // a representação do CONTRATANTE anterior. Não sobrescrever a mesma caixa.
  if (baseSha256 !== round.final_sha256) return null;
  if (!Array.isArray(round.layout_fields)) throw new Error("Posicionamento da assinatura indisponível.");
  const fields = round.layout_fields.filter((value): value is PlacedField => {
    if (!value || typeof value !== "object") return false;
    const field = value as Partial<PlacedField>;
    return field.signerKey === "contratante-1";
  });
  if (fields.filter((field) => field.kind === "signature").length !== 1) {
    throw new Error("O documento preparado não possui campo único para a assinatura do cliente.");
  }
  if (fields.length > 400 || fields.some((field) =>
    !["signature", "initials", "datetime"].includes(field.kind) ||
    !Number.isInteger(field.page) || field.page < 1 ||
    [field.x, field.y, field.width, field.height].some((value) =>
      typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1
    ) || field.x + field.width > 1 || field.y + field.height > 1
  )) throw new Error("Posicionamento da assinatura inválido.");
  return { fields, hasPlaceholders: round.layout_mode === "automatic" };
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** Busca a rodada concluída sem expor layouts ou dados da empresa ao navegador. */
export async function loadExternalAppearance(
  admin: AdminClient,
  input: { modality: "commercial" | "institutional"; documentId: string; baseSha256: string },
): Promise<ExternalSignatureAppearance | null> {
  const column = input.modality === "commercial" ? "commercial_document_id" : "final_document_id";
  const { data, error } = await admin.from("contract_company_signature_rounds")
    .select("final_sha256,layout_mode,layout_fields")
    .eq(column, input.documentId).eq("status", "completed").maybeSingle();
  if (error || !data) throw new Error("Assinatura da empresa não localizada para este documento.");
  return clientFieldsForBase(data as { final_sha256: string; layout_mode: string; layout_fields: unknown }, input.baseSha256);
}
