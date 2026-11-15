/**
 * Chave de acesso da NFS-e Nacional conforme TSChaveNFSe:
 * 6 dígitos do município + 14 caracteres de inscrição federal
 * (numéricos ou alfanuméricos MAIÚSCULOS) + 30 dígitos finais.
 *
 * Fonte vendorizada: xsd/prodrest-v1.01-20261020/tiposSimples_v1.01.xsd.
 * Não tratar como 50 dígitos: o CNPJ alfanumérico é permitido no XSD.
 * A função só verifica formato; não substitui assinatura/XSD nem
 * consulta à SEFIN e não deve completar/truncar chaves recebidas.
 */
export const NFSE_ACCESS_KEY_PATTERN = /^[0-9]{6}[0-9A-Z]{14}[0-9]{30}$/;

export function isValidNfseAccessKey(value: string | undefined | null): value is string {
  return typeof value === "string" && NFSE_ACCESS_KEY_PATTERN.test(value);
}
