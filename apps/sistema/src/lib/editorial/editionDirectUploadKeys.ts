/** Chaves criadas pelo plano de upload direto. Bloqueiam deleção
 * de PDF/capa já publicados ou de arquivos arbitrários do mesmo prefixo.
 * Não executa rede nem depende de credenciais R2.
 */
export function isEditionDirectUploadPair(pdfKey:string,coverKey:string,
  editionNumber:number,publicationDate:string):boolean {
 if(!Number.isInteger(editionNumber)||editionNumber<=0)return false;
 const year=/^\d{4}-/.test(publicationDate)?publicationDate.slice(0,4):"sem-ano";
 const prefix=`jornal-online/${year}/edicao-${String(editionNumber).padStart(4,"0")}/`;
 if(!pdfKey.startsWith(prefix)||!coverKey.startsWith(prefix))return false;
 const pdf=pdfKey.slice(prefix.length);
 const cover=coverKey.slice(prefix.length);
 const p=/^([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})-([a-z0-9][a-z0-9-]{0,72})\.pdf$/i.exec(pdf);
 const c=/^capa-([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\.webp$/i.exec(cover);
 return Boolean(p&&c&&p[1].toLowerCase()===c[1].toLowerCase());
}
