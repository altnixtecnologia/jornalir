/** Compatibilidade com o endpoint usado pela versão Android v.00.02.
 * Não duplica validação, fila ou autenticação; encaminha todos os métodos
 * ao contrato único de /api/public/native-push.
 * Apenas as variáveis NATIVE_FCM_REGISTRATION_ENABLED e
 * NATIVE_FCM_DELIVERY_ENABLED podem liberar o fluxo.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { GET, POST, DELETE, OPTIONS } from "../../native-push/route";
