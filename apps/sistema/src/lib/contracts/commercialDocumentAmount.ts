export function commercialDocumentAmount(mode: "combined" | "separate", saleAmount: number, item?: Record<string, unknown> | null): number {
  const result = mode === "combined" ? saleAmount : item?.totalAmount;
  if (typeof result !== "number" || !Number.isFinite(result) || result < 0) {
    throw new Error("Valor histórico do documento não informado ou inválido.");
  }
  return result;
}
