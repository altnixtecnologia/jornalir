"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth/AuthProvider";

/**
 * Camada de UX do lado do cliente (Fase 20) — NÃO é a proteção real.
 * `/sistema/*` já está protegido de verdade pelo middleware
 * (`src/middleware.ts`, server-side, valida a sessão a cada requisição
 * antes de qualquer conteúdo ser enviado). Este componente só evita um
 * flash de conteúdo enquanto o React hidrata e reage a mudanças de sessão
 * que acontecem depois da carga inicial (ex.: logout, expiração).
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
