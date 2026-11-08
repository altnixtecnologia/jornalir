import "server-only";

import { TEMPLATE_DOCUMENT_BUCKET } from "./templateDocument";

/**
 * Bucket PRIVADO `contract-template-files` (PDF, 10 MB), sem policy em
 * storage.objects: só o servidor (service role) grava/lê, depois de checar a
 * permissão; entrega por URL assinada de curta duração. Caminho endereçado
 * por hash (`templates/<sha256>.pdf`) — nunca sobrescreve.
 */

export const TEMPLATE_DOCUMENT_URL_TTL_SECONDS = 60;

export async function uploadTemplateDocument(path: string, bytes: Uint8Array): Promise<"created" | "exists"> {
  const { createSupabaseAdminClient } = await import("../supabase/admin");
  const { error } = await createSupabaseAdminClient()
    .storage.from(TEMPLATE_DOCUMENT_BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: false, cacheControl: "private, max-age=0" });
  if (!error) return "created";
  const status = (error as { statusCode?: string | number }).statusCode;
  if (String(status) === "409" || /already exists|duplicate/i.test(error.message)) return "exists";
  throw new Error("Não foi possível armazenar o PDF do modelo. Tente novamente.");
}

export async function createTemplateDocumentSignedUrl(path: string): Promise<string> {
  const { createSupabaseAdminClient } = await import("../supabase/admin");
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(TEMPLATE_DOCUMENT_BUCKET)
    .createSignedUrl(path, TEMPLATE_DOCUMENT_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error("Não foi possível abrir o documento agora.");
  return data.signedUrl;
}
