import {createHash} from "node:crypto";
/** Identificador determinístico para evitar arquivos órfãos multiplicados.
 * A escolha não dá acesso ao Storage (bucket privado + RLS continuam exigidos).
 */
export function commercialDocumentId(packageId:string,serviceId:string|null):string {
 const hash=createHash("sha256")
  .update("commercial-contract-document:v1:"+packageId+":"+(serviceId??"combined"))
  .digest("hex");
 // UUID v8, variante RFC 4122; sem colisões práticas no conjunto de entradas.
 return [hash.slice(0,8),hash.slice(8,12),"8"+hash.slice(13,16),
         "8"+hash.slice(17,20),hash.slice(20,32)].join("-");
}
