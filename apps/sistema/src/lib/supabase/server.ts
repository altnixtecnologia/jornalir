import "server-only";
import { cookies, type UnsafeUnwrappedCookies } from "next/headers";
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
  // Transição Next 15: a fábrica é usada por rotas/actions síncronas antigas.
  // Next 15 ainda suporta acesso síncrono. Migrar gradualmente para await cookies()
  // antes de adotar Next 16 (que remove a compatibilidade).
  const cookieStore = cookies() as unknown as UnsafeUnwrappedCookies;

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
