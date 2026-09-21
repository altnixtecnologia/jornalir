import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "./env";

/**
 * Cliente Supabase do navegador (Fase 20) — usa `@supabase/ssr` para
 * guardar a sessão em cookies (não em `localStorage`), do mesmo jeito que
 * o cliente do servidor lê. É isso que permite ao middleware/Server
 * Components validarem a sessão sem depender de nada que só existe no
 * browser. Só a publishable key (segura no cliente); nunca a service role.
 */
export function createSupabaseBrowserClient(): SupabaseClient {
  const { url, publishableKey } = getSupabasePublicEnv();
  return createBrowserClient(url, publishableKey);
}
