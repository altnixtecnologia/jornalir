import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Cliente Supabase do portal público (Fase 30) — só a chave publicável,
 * nunca `service_role`, nunca uma sessão (o portal não tem login). Lê
 * exclusivamente as views `public_*` (RLS das tabelas-base continua só
 * para staff autenticado — ver `supabase/migrations/20260930100000_*`).
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
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
