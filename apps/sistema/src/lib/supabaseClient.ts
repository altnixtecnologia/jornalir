import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente do projeto Supabase `site-system-ir` (IR Core) — preparado nesta
 * fase, ainda não consumido por nenhuma tela (o painel continua 100% sobre
 * os providers mock de `@ir/mocks`; ver docs/DATABASE-IR-CORE.md). Usa
 * apenas a publishable key (segura no cliente); nunca a service role.
 *
 * `createSupabaseClient()` lança se as variáveis não estiverem definidas,
 * em vez de criar um cliente inválido silenciosamente — só é chamado
 * quando alguém de fato precisar de uma conexão real.
 */
export function createSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY em apps/sistema/.env.local (ver .env.example).",
    );
  }

  return createClient(url, publishableKey);
}
