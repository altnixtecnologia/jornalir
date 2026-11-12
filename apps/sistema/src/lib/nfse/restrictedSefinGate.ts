/** 
 * Porta de seguranca EXCLUSIVA para preparar a integracao SEFIN em
 * Produção Restrita. Nao e configurada em nenhuma implantacao atual.
 * Uma preview Vercel nao pode apontar para o Supabase oficial do Jornal IR.
 *
 * O gate e SERVER-SIDE e nao publica credenciais em NEXT_PUBLIC.
 * Independente do gate de interface NFSE_AVAILABLE_IN_THIS_RELEASE,
 * que continua false. A composicao oficial nao importa este modulo.
 */
export interface RestrictedSefinEnvironment {
  vercelEnv?: string;
  restrictedEnabled?: string;
  homologationEnabled?: string;
  homologationProjectRef?: string;
  supabaseUrl?: string;
}

export function isRestrictedSefinEnvironment(env: RestrictedSefinEnvironment): boolean {
  if (env.vercelEnv !== "preview") return false;
  if (env.restrictedEnabled !== "true" || env.homologationEnabled !== "true") return false;
  const projectRef = env.homologationProjectRef;
  if (!projectRef || !/^[a-z0-9]{20}$/.test(projectRef)) return false;
  try {
    const url = new URL(env.supabaseUrl ?? "");
    return url.protocol === "https:" &&
      url.hostname === `${projectRef}.supabase.co` &&
      url.pathname === "/" && !url.username && !url.password &&
      !url.port && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function assertRestrictedSefinEnvironment(env: RestrictedSefinEnvironment): void {
  if (!isRestrictedSefinEnvironment(env)) {
    throw new Error("SEFIN Produção Restrita bloqueada: exigir preview isolada, flag server-side e Supabase de homologação.");
  }
}

export function restrictedSefinEnvironmentFromServer(): RestrictedSefinEnvironment {
  return {
    vercelEnv: process.env.VERCEL_ENV,
    restrictedEnabled: process.env.IR_NFSE_PRODUCAO_RESTRITA_ENABLED,
    homologationEnabled: process.env.IR_HOMOLOGATION_ENABLED,
    homologationProjectRef: process.env.IR_HOMOLOGATION_SUPABASE_REF,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
}
