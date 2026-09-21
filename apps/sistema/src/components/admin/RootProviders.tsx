"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "../../lib/auth/AuthProvider";

/** Envolve todo o app (login + painel) numa única instância de sessão real. */
export function RootProviders({ children }: { children: ReactNode }): JSX.Element {
  return <AuthProvider>{children}</AuthProvider>;
}
