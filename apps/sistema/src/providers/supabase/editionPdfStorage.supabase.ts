import type { SupabaseClient } from "@supabase/supabase-js";

export const EDITION_PDF_BUCKET = "edition-pdfs";
export const MAX_EDITION_PDF_BYTES = 50 * 1024 * 1024;

export class InvalidEditionPdfUploadError extends Error {}

function sanitizeFileName(name: string): string {
  const base = name
    .replace(/\.pdf$/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "edicao"}.pdf`;
}

/**
 * Bucket próprio (`edition-pdfs`, privado — só staff lê/escreve, Fase 28):
 * gestão interna do PDF oficial de cada edição, separada do fluxo público
 * de Flipbook/Google Drive de `apps/site` (nunca tocado por este código).
 * Mesmo padrão de validação/sanitização de `mediaStorage.supabase.ts`
 * (Fase 26): tipo/tamanho checados no servidor, caminho `{uuid}/{arquivo}`
 * nunca colide.
 */
export async function uploadEditionPdf(client: SupabaseClient, file: File): Promise<{ storagePath: string }> {
  if (file.type !== "application/pdf") {
    throw new InvalidEditionPdfUploadError(`Formato não aceito: ${file.type || "desconhecido"}. Envie um PDF.`);
  }
  if (file.size > MAX_EDITION_PDF_BYTES) {
    throw new InvalidEditionPdfUploadError(
      `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite de ${MAX_EDITION_PDF_BYTES / 1024 / 1024} MB.`,
    );
  }

  const path = `${crypto.randomUUID()}/${sanitizeFileName(file.name)}`;
  const { error } = await client.storage.from(EDITION_PDF_BUCKET).upload(path, file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) throw new Error(error.message);

  return { storagePath: path };
}

/**
 * Bucket privado — nunca uma URL permanente. Gerada de novo a cada leitura
 * (1 hora de validade, suficiente para abrir o PDF numa aba), nunca
 * guardada como se fosse fixa.
 */
export async function signEditionPdfUrl(client: SupabaseClient, storagePath: string): Promise<string | undefined> {
  const { data, error } = await client.storage.from(EDITION_PDF_BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (error) return undefined;
  return data.signedUrl;
}
