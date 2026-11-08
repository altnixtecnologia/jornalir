import "server-only";

import { SIGNATURE_BUCKET } from "./signatureImage";

/**
 * Acesso ao bucket PRIVADO `signature-images` — só pelo servidor (service
 * role). O bucket não tem policy em storage.objects de propósito: nenhum
 * papel `anon`/`authenticated` lê ou grava direto. Quem chama DEVE ter
 * checado a permissão antes (Server Action); a entrega ao navegador é por
 * URL assinada de curta duração, nunca por URL pública.
 */

export const SIGNATURE_URL_TTL_SECONDS = 60;

export async function uploadSignatureObject(path: string, bytes: Uint8Array): Promise<"created" | "exists"> {
  const { createSupabaseAdminClient } = await import("../supabase/admin");
  const { error } = await createSupabaseAdminClient()
    .storage.from(SIGNATURE_BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: false, cacheControl: "private, max-age=0" });
  if (!error) return "created";
  const status = (error as { statusCode?: string | number }).statusCode;
  // Caminho endereçado por hash: se já existe, é exatamente o mesmo conteúdo.
  if (String(status) === "409" || /already exists|duplicate/i.test(error.message)) return "exists";
  throw new Error("Não foi possível armazenar a imagem da assinatura. Tente novamente.");
}

export async function createSignatureSignedUrl(path: string): Promise<string> {
  const { createSupabaseAdminClient } = await import("../supabase/admin");
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(SIGNATURE_BUCKET)
    .createSignedUrl(path, SIGNATURE_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error("Não foi possível exibir a assinatura agora.");
  return data.signedUrl;
}
