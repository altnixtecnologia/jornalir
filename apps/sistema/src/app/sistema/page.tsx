import Link from "next/link";
import { Navbar } from "@ir/ui";

export default function SistemaHomePage(): JSX.Element {
  return (
    <main className="min-h-screen">
      <Navbar
        title="Sistema Regional"
        links={[
          { href: "/sistema/patrocinadores", label: "Patrocinadores" },
          { href: "/sistema/anuncios", label: "Anuncios" },
          { href: "http://localhost:3000", label: "Ver Site" }
        ]}
      />
      <section className="mx-auto w-full max-w-6xl px-4 py-8">
        <h1 className="text-3xl font-bold">Painel de Gestao</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">Gerencie patrocinadores e anuncios negociados manualmente.</p>
        <div className="mt-6 flex gap-3">
          <Link href="/sistema/patrocinadores" className="rounded-lg bg-sky-700 px-4 py-2 text-white">Abrir patrocinadores</Link>
          <Link href="/sistema/anuncios" className="rounded-lg border border-slate-400 px-4 py-2">Abrir anuncios</Link>
        </div>
      </section>
    </main>
  );
}
