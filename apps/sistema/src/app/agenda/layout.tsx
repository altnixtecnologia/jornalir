import Link from "next/link";
import type { ReactNode } from "react";
import { AuthGate } from "../../components/admin/AuthGate";

export default function AgendaStandaloneLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <AuthGate>
      <div className="agenda-app-shell">
        <header className="agenda-app-header">
          <Link href="/agenda" className="agenda-app-brand" aria-label="Agenda JornalIR">
            <img src="/brand/logo-escrita.png" alt="Informativo Regional" />
            <span>Agenda</span>
          </Link>
          <Link href="/sistema/agenda" className="agenda-app-back">Painel completo</Link>
        </header>
        <main className="agenda-app-content">{children}</main>
      </div>
    </AuthGate>
  );
}
