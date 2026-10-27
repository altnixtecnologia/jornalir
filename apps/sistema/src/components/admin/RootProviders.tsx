"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "../../lib/auth/AuthProvider";
import { ToastProvider } from "../feedback/ToastProvider";

/**
 * Envolve todo o app (login + painel) numa única instância de sessão real.
 * `localPreview` só chega aqui como prop já decidida pelo Server Component
 * raiz (`app/layout.tsx`) — este componente client nunca lê a env var.
 *
 * `ToastProvider` monta o container global de avisos flutuantes (Fase 20)
 * aqui — funciona em todo o IR Controle, inclusive login/definir-senha,
 * que também passam por este layout raiz.
 */
export function RootProviders({ children, localPreview = false }: { children: ReactNode; localPreview?: boolean }): JSX.Element {
  return (
    <AuthProvider localPreview={localPreview}>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  );
}
