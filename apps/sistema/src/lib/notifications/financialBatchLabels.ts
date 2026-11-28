/** Rótulos do envio manual em lote. Arquivo sem dependências: seguro para o bundle do navegador. */
export type BatchKind = "billing" | "confirmation" | "receipt";
export const BATCH_KIND_LABEL: Record<BatchKind, string> = {
  billing: "Lembrete de cobrança (com Pix vigente)", confirmation: "Confirmação de pagamento", receipt: "Aviso de recibo disponível",
};
