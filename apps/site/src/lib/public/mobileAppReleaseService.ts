import { getPublicSupabaseClient } from "./supabasePublicClient";

export type AndroidRelease = {
  versionLabel: string;
  versionCode: number;
  downloadUrl: string;
  sizeBytes: number;
  releaseNotes: string;
  publishedAt: string | null;
};

/** Falha fechada: só expõe uma versão quando a publicação e o arquivo
 * estiverem completos. A página usa renderização dinâmica/no-store. */
export async function getPublishedAndroidRelease(): Promise<AndroidRelease | null> {
  try {
    const db = getPublicSupabaseClient();
    const { data, error } = await db
      .from("mobile_app_releases")
      .select("version_label,version_code,apk_url,apk_size_bytes,release_notes,published_at")
      .eq("platform", "android").eq("published", true).maybeSingle();
    if (error || !data || typeof data.apk_url !== "string") return null;
    const parsed = new URL(data.apk_url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return {
      versionLabel: data.version_label,
      versionCode: data.version_code,
      downloadUrl: parsed.toString(),
      sizeBytes: Number(data.apk_size_bytes || 0),
      releaseNotes: data.release_notes ?? "",
      publishedAt: data.published_at,
    };
  } catch {
    return null;
  }
}
