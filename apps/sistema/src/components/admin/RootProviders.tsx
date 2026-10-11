"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "../../lib/auth/AuthProvider";

/**
 * Envolve todo o app (login + painel) numa única instância de sessão real.
 * `localPreview` só chega aqui como prop já decidida pelo Server Component
 * raiz (`app/layout.tsx`) — este componente client nunca lê a env var.
 */
export function RootProviders({ children, localPreview = false }: { children: ReactNode; localPreview?: boolean }): JSX.Element {
  return <AuthProvider localPreview={localPreview}>{children}</AuthProvider>;
}
