import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { canUseSupabaseAdminCredentials } from "../release/previewIsolationPolicy";

/**
 * Cliente administrativo (Admin API do Supabase) — a ÚNICA função deste
 * projeto que usa `SUPABASE_SERVICE_ROLE_KEY`. `import "server-only"`
 * (linha acima) faz o build falhar se este arquivo for importado por
 * engano a partir de um Client Component — a chave nunca pode chegar ao
 * bundle do navegador. Chamado só por Server Actions (`usuarios/actions.ts`).
 *
 * A variável é opcional de propósito: enquanto não estiver configurada
 * (ambiente local sem a chave, por exemplo), `hasServiceRoleKey()` volta
 * `false` e a UI mostra "criação de usuários ainda não habilitada" em vez
 * de quebrar — nunca lançamos aqui como em `createSupabaseClient()`.
 */
export function hasServiceRoleKey(): boolean {
  // Segurança: Preview/Staging na Vercel NUNCA usam credencial privilegiada,
  // mesmo que a variável tenha sido configurada por engano.
  return canUseSupabaseAdminCredentials(process.env.VERCEL_ENV, {
    homologationEnabled: process.env.IR_HOMOLOGATION_ENABLED,
    homologationProjectRef: process.env.IR_HOMOLOGATION_SUPABASE_REF,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  })
    && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createSupabaseAdminClient(): SupabaseClient {
  if (!canUseSupabaseAdminCredentials(process.env.VERCEL_ENV, {
    homologationEnabled: process.env.IR_HOMOLOGATION_ENABLED,
    homologationProjectRef: process.env.IR_HOMOLOGATION_SUPABASE_REF,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  })) {
    throw new Error("Admin API desativada fora do ambiente Production da Vercel.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Admin API do Supabase não configurada: defina SUPABASE_SERVICE_ROLE_KEY em apps/sistema/.env.local (nunca commitado). Verifique hasServiceRoleKey() antes de chamar esta função.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
