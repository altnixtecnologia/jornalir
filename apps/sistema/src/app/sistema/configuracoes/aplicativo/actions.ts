"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";

type Result = { ok: true } | { error: string };
const R2_ORIGIN = "https://pub-3d61ff8f7b474fcdbaa936f006ba2bf4.r2.dev";
const AUDIT_ENTITY_ID = "00000000-0000-4000-8000-000000000204";

export async function saveAndroidAppReleaseAction(input: {
  versionLabel: string; versionCode: number; apkUrl: string;
  sha256: string; fileSizeBytes: string; releaseNotes: string; published: boolean;
}): Promise<Result> {
  const db = createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: "Faça login para continuar." };
  const { data: profile } = await db.from("profiles").select("active,role").eq("id", user.id).maybeSingle();
  if (!profile?.active || !["owner", "admin"].includes(profile.role)) return { error: "Somente administradores podem publicar versões." };

  const versionLabel = input.versionLabel.trim();
  const versionCode = Number(input.versionCode);
  const apkUrl = input.apkUrl.trim();
  const sha256 = input.sha256.trim().toLowerCase();
  const size = Number(input.fileSizeBytes);
  const notes = input.releaseNotes.trim().slice(0, 1500);
  if (!/^v\.[0-9]{2}\.[0-9]{2}$/.test(versionLabel)) return { error: "Use versões no formato v.00.00." };
  if (!Number.isSafeInteger(versionCode) || versionCode < 1) return { error: "Código interno da versão inválido." };
  if (apkUrl && !isAllowedApkUrl(apkUrl)) return { error: "Informe um link HTTPS de APK no R2 autorizado." };
  if (sha256 && !/^[0-9a-f]{64}$/.test(sha256)) return { error: "SHA-256 inválido." };
  if (input.fileSizeBytes.trim() && (!Number.isSafeInteger(size) || size < 1)) return { error: "Tamanho do APK inválido." };

  if (input.published) {
    if (!apkUrl || !sha256 || !Number.isSafeInteger(size) || size < 1) {
      return { error: "Para liberar o APK informe o link, o SHA-256 e o tamanho em bytes." };
    }
    try {
      const response = await fetch(apkUrl, { method: "HEAD", signal: AbortSignal.timeout(8000), cache: "no-store", redirect: "error" });
      if (!response.ok) return { error: "O APK não está disponível no endereço informado." };
      const actualLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(actualLength) && actualLength > 0 && actualLength !== size) {
        return { error: "O tamanho informado não corresponde ao arquivo no R2." };
      }
    } catch {
      return { error: "Não foi possível confirmar o APK no R2. Publicação cancelada." };
    }
  }

  const { data: existing, error: oldError } = await db.from("mobile_app_releases")
    .select("published,version_label,version_code,published_at").eq("platform", "android").maybeSingle();
  if (oldError || !existing) return { error: "Cadastro de versões indisponível. Confira a migration." };
  if (input.published && existing.published && versionCode < existing.version_code) {
    return { error: "O código da versão nova não pode ser menor que o já publicado." };
  }
  const now = new Date().toISOString();
  const { error } = await db.from("mobile_app_releases").update({
    version_label: versionLabel, version_code: versionCode,
    apk_url: apkUrl || null, apk_sha256: sha256 || null,
    apk_size_bytes: input.fileSizeBytes.trim() ? size : null,
    release_notes: notes, published: input.published,
    published_at: input.published ? (existing.published && existing.version_label === versionLabel && existing.published_at ? existing.published_at : now) : null,
    updated_by: user.id,
  }).eq("platform", "android");
  if (error) return { error: "Falha ao salvar versão: " + error.message };
  await recordAuditEventSupabase(db, {
    userId: user.id, entityType: "mobile_app_releases",
    entityId: AUDIT_ENTITY_ID, action: "update",
    metadata: { version_label: versionLabel, version_code: versionCode, published: input.published },
  });
  revalidatePath("/sistema/configuracoes/aplicativo");
  return { ok: true };
}

function isAllowedApkUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.origin === (process.env.APP_APK_ALLOWED_ORIGIN || R2_ORIGIN)
      && url.protocol === "https:" && !url.username && !url.password
      && url.pathname.toLowerCase().endsWith(".apk")
      && !url.search && !url.hash;
  } catch {
    return false;
  }
}
