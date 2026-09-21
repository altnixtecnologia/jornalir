"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth/AuthProvider";

/**
 * Portão de acesso do painel interno — Supabase Auth real (Fase 19). Sem
 * sessão válida, ou com profile.active = false, manda para /login antes de
 * mostrar qualquer tela real.
 */
export function AuthGate({ children }: { children: ReactNode }): JSX.Element | null {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (status === "inactive") {
      router.replace("/login?erro=inativo");
    }
  }, [status, router]);

  if (status !== "authenticated") return null;
  return <>{children}</>;
}
