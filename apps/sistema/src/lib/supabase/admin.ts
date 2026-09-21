import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createSupabaseAdminClient(): SupabaseClient {
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
