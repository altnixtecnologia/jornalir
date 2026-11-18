import type { Metadata } from "next";
import { SiteHeader } from "../../../components/site/SiteHeader";
import { AppInstallInvitation } from "../../../components/site/AppInstallInvitation";

export const metadata: Metadata = {
  title: "Instalar o Jornal IR no celular",
  description: "Instale o Jornal Informativo Regional na tela inicial do iPhone ou Android, com instruções simples.",
};

export default function InstalarJornalPage(): JSX.Element {
  return (
    <main className="min-h-screen" style={{ background: "var(--site-bg)" }}>
      <SiteHeader />
      <div className="site-shell py-6 sm:py-12">
        <div className="mx-auto max-w-xl">
          <AppInstallInvitation mode="page" />
        </div>
      </div>
    </main>
  );
}
