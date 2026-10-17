import { SiteHeader } from "../../components/site/SiteHeader";

/**
 * Loading discreto do route group público — Next troca automaticamente
 * por este conteúdo enquanto a página server-side (ex.: /noticias,
 * /editoria/[slug]) ainda está buscando dados, e troca de volta pro
 * conteúdo real quando terminar (nunca fica visível indefinidamente —
 * controlado pelo próprio Suspense boundary do Next, não por timer).
 * Deliberadamente simples (só uma linha de texto, mesmo cabeçalho de
 * sempre) — nenhum skeleton elaborado, nenhuma animação, pra não
 * introduzir deslocamento de layout entre o loading e o conteúdo real.
 */
export default function PublicLoading(): JSX.Element {
  return (
    <main className="min-h-screen" style={{ background: "var(--site-bg)" }}>
      <SiteHeader />
      <section className="site-shell py-10 text-center">
        <p role="status" aria-live="polite" className="text-sm" style={{ color: "var(--site-muted)" }}>
          Carregando…
        </p>
      </section>
    </main>
  );
}
