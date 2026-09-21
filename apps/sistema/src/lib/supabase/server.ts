import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "./env";

/**
 * Cliente Supabase para Server Components/Actions/Route Handlers (Fase 20)
 * — lê/escreve a sessão via cookies (`next/headers`), nunca via
 * `localStorage`. Usado por Server Actions que precisam saber quem é o
 * usuário de verdade (nunca confiar numa flag vinda do cliente) e por
 * qualquer leitura/escrita que deva respeitar a RLS como aquele usuário.
 * Ainda a publishable key — nunca a service role (ver `./admin.ts`).
 */
export function createSupabaseServerClient(): SupabaseClient {
  const { url, publishableKey } = getSupabasePublicEnv();
  const cookieStore = cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado de dentro de um Server Component (não pode escrever
          // cookies) — inofensivo aqui porque o middleware já cuida de
          // renovar a sessão a cada request.
        }
      },
    },
  });
}
