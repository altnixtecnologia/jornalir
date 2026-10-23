/** Prévia de conferência comercial: NÃO constitui minuta jurídica final. */
export interface CommercialServiceForPreview {
  item_ordinal: number;
  service_title: string;
  service_channel: string;
  source_snapshot: Record<string, unknown>;
  starts_on: string | null;
  ends_on: string | null;
  service_location: string | null;
  service_scope: string | null;
  execution_conditions: string | null;
}
export interface CommercialPreviewInput {
  reference: string;
  clientName: string;
  amount: number;
  mode: "combined" | "separate";
  services: CommercialServiceForPreview[];
}
export interface CommercialPreviewDocument {
  title: string;
  text: string;
}
export interface CommercialPreviewResult {
  documents: CommercialPreviewDocument[];
  missing: string[];
}
function normal(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function money(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "NÃO INFORMADO NA VENDA";
}
function date(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "PENDENTE";
  const [year, month, day] = value.split("-");
  return day + "/" + month + "/" + year;
}
const DRAFT_NOTICE =
  "MINUTA DE CONFERÊNCIA — SEM VALIDADE CONTRATUAL. NÃO ASSINAR.\n" +
  "Cláusulas jurídicas, responsabilidades, rescisão, multa, foro e aceite " +
  "devem ser aprovados e inseridos no modelo jurídico versionado antes da emissão.";

export function buildCommercialContractPreview(input: CommercialPreviewInput): CommercialPreviewResult {
  const missing: string[] = [];
  if (!normal(input.reference)) missing.push("Referência da venda");
  if (!normal(input.clientName)) missing.push("Nome do contratante");
  if (!Number.isFinite(input.amount) || input.amount < 0) missing.push("Valor total da venda");
  if (!Array.isArray(input.services) || input.services.length === 0) {
    return { documents: [], missing: ["Serviços contratados"] };
  }
  if (!["combined", "separate"].includes(input.mode)) throw new Error("Modalidade de documento inválida.");
  const ordered = [...(input.services ?? [])].sort((a, b) => a.item_ordinal - b.item_ordinal);
  const sections = ordered.map((service, i) => {
    const label = "Serviço " + (i + 1) + " (" + (normal(service.service_title) || "sem título") + ")";
    if (!service.starts_on) missing.push(label + ": início");
    if (!service.ends_on) missing.push(label + ": término");
    if (service.starts_on && service.ends_on && service.ends_on < service.starts_on) missing.push(label + ": término anterior ao início");
    if (!normal(service.service_scope)) missing.push(label + ": objeto/entregas");
    if (["led_panel", "equipment_rental"].includes(service.service_channel) && !normal(service.service_location)) {
      missing.push(label + ": local de prestação");
    }
    const itemAmount = service.source_snapshot?.totalAmount;
    if (typeof itemAmount !== "number" || !Number.isFinite(itemAmount) || itemAmount < 0) {
      missing.push(label + ": valor negociado");
    }
    const quantity = service.source_snapshot?.quantity;
    const quantityText = typeof quantity === "number" && Number.isFinite(quantity) ? String(quantity) : "CONFERIR";
    return [
      label.toUpperCase(),
      "Canal/modalidade: " + service.service_channel,
      "Quantidade negociada: " + quantityText,
      "Valor do item conforme proposta original: " + money(service.source_snapshot?.totalAmount),
      "Período: " + date(service.starts_on) + " a " + date(service.ends_on),
      "Local: " + (normal(service.service_location) || "A CONFIRMAR"),
      "Objeto e entregas: " + (normal(service.service_scope) || "PENDENTE"),
      "Condições operacionais adicionais: " + (normal(service.execution_conditions) || "Não cadastradas"),
    ].join("\n");
  });
  const common = [
    DRAFT_NOTICE,
    "Venda: " + (normal(input.reference) || "PENDENTE"),
    "Contratante: " + (normal(input.clientName) || "PENDENTE"),
  ].join("\n");
  const documents = input.mode === "combined"
    ? [{
        title: "Conferência — serviços reunidos",
        text: [common, "Valor TOTAL da venda: " + money(input.amount), ...sections].join("\n\n"),
      }]
    : sections.map((section, i) => ({
        title: "Conferência — " + (ordered[i]?.service_title || "Serviço " + (i + 1)),
        text: [common, section].join("\n\n"),
      }));
  return { documents, missing };
}
