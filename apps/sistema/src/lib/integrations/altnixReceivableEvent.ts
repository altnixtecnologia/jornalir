import "server-only";
import { createSupabaseAdminClient } from "../supabase/admin";
import { reassessAfterReceivableCommit } from "./altnixServiceAuthorization";

/** Somente após commit financeiro autorizado. Não faz HTTP ao Informativo,
 * não interfere no recibo confirmado; a fila central entrega depois.
 * A rotina diária deverá recuperar eventual falha ou lote incompleto. */
export async function notifyAltnixReceivableCommit(ids:string[]):Promise<void>{
 const state=await reassessAfterReceivableCommit(async(name,args)=>await createSupabaseAdminClient().rpc(name,args),ids);
 if(state==="review"||state==="invalid")console.warn("altnix_receivable_reassessment_pending");
}
