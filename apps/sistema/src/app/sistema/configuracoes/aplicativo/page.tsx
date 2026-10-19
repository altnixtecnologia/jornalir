import { redirect } from "next/navigation";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { MobileAppReleasePanel } from "../../../../features/configuracoes/MobileAppReleasePanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AplicativoConfiguracoesPage(): Promise<JSX.Element> {
  const db = createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await db.from("profiles").select("active,role").eq("id", user.id).maybeSingle();
  if (!profile?.active || !["owner", "admin"].includes(profile.role)) redirect("/sistema");

  const { data: release, error } = await db.from("mobile_app_releases")
    .select("version_label,version_code,published,apk_url,apk_sha256,apk_size_bytes,release_notes,published_at,updated_at")
    .eq("platform", "android").maybeSingle();

  return (
    <>
      <ModuleHeader eyebrow="CONFIGURAÇÕES" title="Aplicativo Jornal IR"
        description="Versões do aplicativo Android, link de download e controle de publicação." />
      {error || !release ? (
        <section className="form-section form-section--first">
          <h2>Versão v.00.00 — em preparação</h2>
          <p className="helper-text">O cadastro de versões ainda não está disponível no Supabase. Prepare e aplique a migration 20261030100400_mobile_app_android_release.sql antes de liberar um APK.</p>
        </section>
      ) : (
        <MobileAppReleasePanel initial={{
          versionLabel: release.version_label,
          versionCode: release.version_code,
          published: release.published,
          apkUrl: release.apk_url ?? "",
          sha256: release.apk_sha256 ?? "",
          fileSizeBytes: release.apk_size_bytes ? String(release.apk_size_bytes) : "",
          releaseNotes: release.release_notes ?? "",
          publishedAt: release.published_at,
        }} />
      )}
    </>
  );
}
