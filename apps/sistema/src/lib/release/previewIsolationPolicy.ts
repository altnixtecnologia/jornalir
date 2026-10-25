/** Barreira de segurança entre Vercel Preview e o banco real.
 * Toda habilitação de homologação exige um Supabase não produtivo, com
 * referência EXATA. O banco Production nunca é uma opção de Preview.
 * Não hospedar testes usando dados reais copiados de clientes.
 */
export const PRODUCTION_SUPABASE_REF = "iqnzrpdccecgalqboeyf" as const;

export type HomologationIdentity = {
  vercelEnv?: string;
  homologationEnabled?: string;
  homologationProjectRef?: string;
  supabaseUrl?: string;
};

export function isIsolatedHomologation(input: HomologationIdentity): boolean {
  if (input.vercelEnv !== "preview") return false;
  if (input.homologationEnabled !== "true") return false;
  const ref = input.homologationProjectRef?.toLowerCase() ?? "";
  if (!/^[a-z0-9]{20}$/.test(ref) || ref === PRODUCTION_SUPABASE_REF) return false;
  if (typeof input.supabaseUrl !== "string") return false;
  // Canonical HTTPS only, no username, password, path, query or alternative host.
  return input.supabaseUrl === `https://${ref}.supabase.co`
    || input.supabaseUrl === `https://${ref}.supabase.co/`;
}

export function canUseSupabaseAdminCredentials(
  vercelEnv: string | undefined,
  environment: Omit<HomologationIdentity, "vercelEnv"> = {},
): boolean {
  // Node local sem Vercel usa configurações locais de forma explícita.
  if (!vercelEnv || vercelEnv === "production") return true;
  return isIsolatedHomologation({ vercelEnv, ...environment });
}
