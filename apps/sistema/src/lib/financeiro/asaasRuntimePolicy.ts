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
/** Webhooks com service_role não podem alterar banco a partir de Preview. */
export function canProcessAsaasWebhook(input:{vercelEnv?:string}):boolean {
 return input.vercelEnv!=="preview";
}
