import { isIsolatedHomologation, type HomologationIdentity } from "../release/previewIsolationPolicy";

/** Regras sem segredo para separar credenciais Asaas de ambientes Vercel.
 * O banco NÃO pode habilitar integração real em Preview por engano.
 * Política para deploy do Jornal IR (produção Vercel).
 */
export function canUseAsaasProductionApi(input:{
 vercelEnv?:string;
 nodeEnv?:string;
}):boolean {
 return input.vercelEnv==="production" && input.nodeEnv==="production";
}
/** Webhook produtivo só em Production. Para homologação, somente
 * sandbox Asaas E banco Supabase exclusivamente de testes, validado por
 * referência exata. A ausência de qualquer parâmetro mantém DENY.
 */
export function canProcessAsaasWebhook(input:HomologationIdentity & {
  asaasEnvironment?: string;
}):boolean {
 if (input.vercelEnv==="production") return true;
 return input.asaasEnvironment==="sandbox" && isIsolatedHomologation(input);
}
