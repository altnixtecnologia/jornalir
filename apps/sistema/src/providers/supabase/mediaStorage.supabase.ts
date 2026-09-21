import type { SupabaseClient } from "@supabase/supabase-js";

export const ARTICLE_MEDIA_BUCKET = "article-media";
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export class InvalidImageUploadError extends Error {}

function sanitizeFileName(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const base = (lastDot > 0 ? name.slice(0, lastDot) : name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "foto";
  const ext = lastDot > 0 ? name.slice(lastDot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "jpg";
  return `${base}.${ext || "jpg"}`;
}

/**
 * Valida (tipo/tamanho, mesma regra do bucket — checagem no servidor,
 * nunca só confiando no `accept` do `<input type="file">` do navegador) e
 * envia um arquivo de imagem para o Storage, em `{uuid}/{nome-sanitizado}`
 * — nunca colide, mesmo com dois arquivos de nome igual.
 */
export async function uploadImageToArticleMediaBucket(
  client: SupabaseClient,
  file: File,
): Promise<{ storagePath: string; publicUrl: string }> {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
    throw new InvalidImageUploadError(`Formato não aceito: ${file.type || "desconhecido"}. Use JPEG, PNG, WebP ou AVIF.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new InvalidImageUploadError(
      `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite de ${MAX_UPLOAD_BYTES / 1024 / 1024} MB por foto.`,
    );
  }

  const path = `${crypto.randomUUID()}/${sanitizeFileName(file.name)}`;
  const { error } = await client.storage.from(ARTICLE_MEDIA_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const { data } = client.storage.from(ARTICLE_MEDIA_BUCKET).getPublicUrl(path);
  return { storagePath: path, publicUrl: data.publicUrl };
}
