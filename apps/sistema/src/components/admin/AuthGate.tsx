"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { hasMockSession } from "../../lib/mockSession";

/**
 * Portão de acesso do painel interno: sem sessão mock, manda para /login
 * antes de mostrar qualquer tela real. Ainda não é autenticação de verdade
 * (nenhum backend envolvido) — só garante que o painel nunca aparece
 * "aberto" por padrão, coerente com a ideia de acesso restrito.
 */
export function AuthGate({ children }: { children: ReactNode }): JSX.Element | null {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (hasMockSession()) {
      setAuthorized(true);
    } else {
      router.replace("/login");
    }
  }, [router]);

  if (!authorized) return null;
  return <>{children}</>;
}
