import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Cliente Supabase do portal público (Fase 30) — só a chave publicável,
 * nunca `service_role`, nunca uma sessão (o portal não tem login). Lê
 * exclusivamente as views `public_*` (RLS das tabelas-base continua só
 * para staff autenticado — ver `supabase/migrations/20260930100000_*`).
 *
 * `fetch: (url, init) => fetch(url, { ...init, cache: "no-store" })`
 * (Fase 33, achado real): o Next.js App Router intercepta o `fetch`
 * global e, por padrão, cacheia respostas GET mesmo em rotas
 * `force-dynamic` — o `supabase-js` nunca define `cache` explicitamente
 * nas próprias chamadas, então ficava sujeito a esse cache por padrão do
 * Next. Sintoma real observado: `editorial_sections` novas (Saúde/
 * Sociais/Colunistas) apareciam sempre no `curl` direto, mas o servidor
 * (Vercel) continuava enxergando só as 7 antigas mesmo em deployments
 * novos — confirmado com uma rota de diagnóstico temporária. Forçar
 * `cache: "no-store"` aqui, uma vez, resolve para toda leitura pública do
 * portal (nunca depender de `dynamic = "force-dynamic"` sozinho para
 * dados vindos de uma biblioteca de terceiros).
 */
export function getPublicSupabaseClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase não configurado para o portal (NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).",
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return cached;
}
