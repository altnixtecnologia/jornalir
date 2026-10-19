import type { Metadata } from "next";
import { SiteHeader } from "../../../components/site/SiteHeader";
import { getPublishedAndroidRelease } from "../../../lib/public/mobileAppReleaseService";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Aplicativo Jornal IR — Download para Android",
  description: "Baixe o aplicativo oficial do Jornal Informativo Regional para Android.",
};

function formatSize(bytes: number): string {
  return bytes > 0 ? (bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB" : "";
}

export default async function AplicativoPage(): Promise<JSX.Element> {
  const release = await getPublishedAndroidRelease();
  return (
    <main className="min-h-screen" style={{ background: "var(--site-bg)" }}>
      <SiteHeader />
      <div className="site-shell py-8 sm:py-12">
        <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: "var(--site-line)" }}>
          <div className="px-6 py-8 text-white sm:px-10 sm:py-10" style={{ background: "linear-gradient(135deg,#23234d,#3d3d70)" }}>
            <div className="mb-4 flex items-center gap-3">
              <img src="/brand/logo-ir.png" alt="Jornal IR" className="h-11 w-auto object-contain" />
              <span className="rounded-full border border-white/40 px-3 py-1 text-xs font-semibold">Aplicativo Jornal IR · Android</span>
            </div>
            <h1 className="font-editorial text-3xl font-bold sm:text-4xl">Jornal IR no seu celular</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/85 sm:text-base">
              Notícias e informações da nossa região, com a experiência do portal adaptada ao celular.
            </p>
          </div>
          <div className="space-y-5 p-6 sm:p-10">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold">Versão disponível</span>
              <span className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-semibold">{release?.versionLabel ?? "v.00.00 — em preparação"}</span>
            </div>
            {release ? (
              <>
                <a href={release.downloadUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-xl px-6 py-3.5 text-sm font-extrabold text-white sm:w-auto"
                  style={{ background: "var(--brand-red)" }}>
                  Baixar aplicativo para Android (APK)
                </a>
                <p className="text-xs" style={{ color: "var(--site-muted)" }}>
                  {formatSize(release.sizeBytes)}{release.publishedAt ? " · Publicado em " + new Date(release.publishedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : ""}
                </p>
                {release.releaseNotes ? <p className="text-sm leading-relaxed">{release.releaseNotes}</p> : null}
                <div className="rounded-xl border p-4 text-sm leading-relaxed" style={{ borderColor: "var(--site-line)" }}>
                  <strong>Como instalar:</strong> abra o link no Android, aguarde o download e toque no arquivo APK.
                  Se o próprio Android solicitar, autorize a instalação apenas para o aplicativo usado no download.
                  Não desative as proteções gerais do aparelho.
                </div>
              </>
            ) : (
              <div className="rounded-xl border p-5" style={{ borderColor: "var(--site-line)" }}>
                <p className="font-bold">O download será disponibilizado em breve.</p>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--site-muted)" }}>
                  Assim que o aplicativo estiver disponível, o botão para baixar aparecerá nesta página.
                </p>
              </div>
            )}
            <p className="text-xs leading-relaxed" style={{ color: "var(--site-muted)" }}>
              Baixe o aplicativo somente pelos links oficiais do Jornal IR. Em breve, também teremos os links para Google Play e App Store.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
