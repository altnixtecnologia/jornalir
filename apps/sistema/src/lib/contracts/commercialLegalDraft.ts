import type { CommercialPreviewDocument } from "./commercialContractPreview";

/**
 * Substitui apenas campos conhecidos ou fornecidos explicitamente pelo
 * operador. Nunca interpreta expressões; campos ausentes impedem o PDF.
 * Não valida juridicamente o modelo. A saída é só minuta de revisão.
 */
export function renderCommercialLegalDraft(input: {
  templateText: string;
  reference: string;
  clientName: string;
  totalPrice: string;
  document: CommercialPreviewDocument;
  values?: Record<string, string>;
  qualification?: Record<string, string>;
}): { text: string; missing: string[] } {
  const predefined: Record<string,string> = {
    "cliente.nome": input.clientName.trim(),
    "venda.referencia": input.reference.trim(),
    "venda.valor": input.totalPrice.trim(),
    "servicos.resumo": input.document.text.trim(),
    ...input.qualification,
  };
  const missing = new Set<string>();
  const allowedCustom = input.values ?? {};
  // Campos do cadastro mestre prevalecem sobre valores livres do operador.
  // Entradas livres só complementam variáveis não reservadas.
  const rendered = input.templateText.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_match,key:string) => {
    const known = Object.prototype.hasOwnProperty.call(predefined,key);
    const custom = Object.prototype.hasOwnProperty.call(allowedCustom,key);
    const value = known ? predefined[key] : custom ? allowedCustom[key] : "";
    if (!value?.trim()) missing.add(key);
    return value?.trim() ?? "";
  });
  // Modelos que contêm marcação malformada ou tokens não suportados não
  // podem gerar um PDF assinável nem uma minuta sem alerta.
  // Detectar delimitadores isolados, aninhados ou inválidos, inclusive espaços.
  if (rendered.includes("{{") || rendered.includes("}}") || rendered.includes("{%") || rendered.includes("%}")) {
    missing.add("marcadores inválidos no modelo");
  }
  // Sem nome ou referência válidos não há qualificação mínima da minuta.
  if (!input.clientName.trim()) missing.add("cliente.nome");
  if (!input.reference.trim()) missing.add("venda.referencia");
  if (!input.totalPrice.trim()) missing.add("venda.valor");
  if (!input.templateText.trim()) missing.add("conteúdo do modelo");
  if (!input.document.text.trim()) missing.add("detalhes dos serviços");
  const text = [
    "MINUTA PARA CONFERÊNCIA JURÍDICA — NÃO ASSINAR",
    "DOCUMENTO NÃO EMITIDO; NÃO CONSTITUI CONTRATO CELEBRADO.",
    rendered,
    "ANEXO OPERACIONAL — DADOS DA VENDA E DOS SERVIÇOS",
    input.document.text,
  ].join("\n\n");
  return { text, missing: [...missing] };
}
