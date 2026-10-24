/** Somente um PDF idêntico da MESMA edição com capa já arquivada
 * é redundante. PDF sem capa pode ser reenviado para recuperação.
 */
export function isDuplicateEditionUpload(
 current:{pdfSha256?:string;pdfR2Key?:string;coverUrl?:string}|null,
 sha256:string,
):boolean {
 return Boolean(current?.pdfR2Key&&current.coverUrl&&
  /^[a-f0-9]{64}$/i.test(sha256)&&
  current.pdfSha256?.toLowerCase()===sha256.toLowerCase());
}
