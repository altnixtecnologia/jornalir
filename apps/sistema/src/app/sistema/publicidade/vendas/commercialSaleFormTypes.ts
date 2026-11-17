import type { CommercialChannel, CommercialCondition, CommercialProduct, CommercialSaleItemSnapshot } from "@ir/types";
import { COMMERCIAL_CHANNEL_LABELS } from "@ir/types";

/** Os campos antigos continuam aceitos para editar vendas existentes. */
export interface CommercialSaleFormInput {
  clientId: string;
  productId: string;
  channel: string;
  description: string;
  startDate: string;
  endDate: string;
  amount: string;
  commercialCondition: CommercialCondition;
  installmentsCount: string;
  notes: string;
  /** Apenas para criação de novas vendas; sem alterar propostas já convertidas. */
  items?: CommercialSaleLineInput[];
  discountMode?: CommercialSaleDiscountMode;
  discountValue?: string;
}

export interface CommercialSaleLineInput {
  productId: string;
  /** Permite serviço eventual ainda não cadastrado no catálogo. */
  manualName: string;
  unitPrice: string;
}

export type CommercialSaleDiscountMode = "amount" | "percentage";

const cents = (value: number): number => Math.round(value * 100);
const money = (valueCents: number): number => valueCents / 100;

export function calculateCommercialSaleTotals(
  items: readonly Pick<CommercialSaleLineInput, "unitPrice">[],
  discountMode: CommercialSaleDiscountMode,
  discountValue: string,
): { subtotal: number; discount: number; total: number } {
  const subtotalCents = items.reduce((sum, item) => {
    const n = Number(item.unitPrice);
    return sum + (Number.isFinite(n) && n > 0 ? cents(n) : 0);
  }, 0);
  const raw = Number(discountValue || "0");
  const valid = Number.isFinite(raw) && raw > 0 ? raw : 0;
  const discountCents = discountMode === "percentage"
    ? Math.round(subtotalCents * valid / 100)
    : cents(valid);
  const applied = Math.min(subtotalCents, discountCents);
  return {
    subtotal: money(subtotalCents),
    discount: money(applied),
    total: money(subtotalCents - applied),
  };
}

export function toCommercialSaleServiceInput(input: CommercialSaleFormInput) {
  return {
    clientId: input.clientId,
    productId: input.productId || undefined,
    channel: input.channel,
    description: input.description,
    startDate: input.startDate,
    endDate: input.endDate || undefined,
    amount: Number(input.amount),
    commercialCondition: input.commercialCondition,
    installmentsCount: input.commercialCondition === "installments" ? Number(input.installmentsCount || "1") : 1,
    notes: input.notes || undefined,
  };
}

/**
 * O catálogo e o total são recalculados NO SERVIDOR.
 * O desconto global é distribuído em centavos pelas linhas, preservando
 * o total e o snapshot histórico usado por contratos, NFS-e e Financeiro.
 */
export function toNewCommercialSaleServiceInput(input: CommercialSaleFormInput, products: readonly CommercialProduct[]) {
  const rows = input.items ?? [];
  if (rows.length < 1 || rows.length > 50) throw new Error("Adicione entre 1 e 50 produtos na venda.");

  const catalog = new Map(products.filter((p) => p.active).map((p) => [p.id, p]));
  const selected = rows.map((line) => {
    const product = line.productId ? catalog.get(line.productId) : undefined;
    if (line.productId && !product) throw new Error("Um dos produtos não está mais ativo no catálogo. Atualize a página.");
    const name = product?.name ?? line.manualName.trim();
    if (!name) throw new Error("Selecione um produto ou informe seu nome.");
    const raw = line.unitPrice.trim();
    const price = Number(raw);
    if (!raw || !Number.isFinite(price) || price < 0 || price > 100_000_000 || Math.abs(price * 100 - Math.round(price * 100)) > 0.001) {
      throw new Error("Informe um valor válido, com até duas casas decimais, para cada produto.");
    }
    return {
      product, name, channel: (product?.channel ?? "other") as CommercialChannel,
      priceCents: cents(price),
    };
  });

  const subtotalCents = selected.reduce((sum, row) => sum + row.priceCents, 0);
  const rawDiscount = input.discountValue?.trim() || "0";
  const discountNumber = Number(rawDiscount);
  if (!Number.isFinite(discountNumber) || discountNumber < 0) {
    throw new Error("Informe um desconto válido.");
  }
  const discountMode = input.discountMode === "percentage" ? "percentage" : "amount";
  if (discountMode === "percentage" && discountNumber > 100) {
    throw new Error("O desconto percentual deve ficar entre 0% e 100%.");
  }
  if (discountMode === "amount" && Math.abs(discountNumber * 100 - Math.round(discountNumber * 100)) > 0.001) {
    throw new Error("O desconto em reais aceita no máximo duas casas decimais.");
  }
  const totalDiscountCents = discountMode === "percentage"
    ? Math.round(subtotalCents * discountNumber / 100)
    : cents(discountNumber);
  if (totalDiscountCents > subtotalCents) throw new Error("O desconto não pode superar o subtotal.");

  // Base proporcional arredondada para baixo; centavos residuais são
  // atribuídos a linhas com saldo, sem nunca deixar total negativo.
  const perItemDiscount = selected.map((row) => subtotalCents > 0
    ? Math.floor(totalDiscountCents * row.priceCents / subtotalCents)
    : 0);
  let remaining = totalDiscountCents - perItemDiscount.reduce((sum, x) => sum + x, 0);
  for (let i = 0; remaining > 0 && i < selected.length; i += 1) {
    const room = selected[i].priceCents - perItemDiscount[i];
    const share = Math.min(room, remaining);
    perItemDiscount[i] += share;
    remaining -= share;
  }
  if (remaining !== 0) throw new Error("Não foi possível distribuir o desconto entre os produtos.");

  const itemsSnapshot: CommercialSaleItemSnapshot[] = selected.map((line, i) => ({
    // Identificador local estável da linha; não é ID de item de proposta.
    sourceProposalItemId: `direct-sale:${i + 1}`,
    productId: line.product?.id,
    productName: line.name,
    serviceChannel: line.channel,
    description: line.name,
    quantity: 1,
    unitPrice: money(line.priceCents),
    listUnitPrice: line.product?.suggestedPrice,
    discountAmount: money(perItemDiscount[i]),
    totalAmount: money(line.priceCents - perItemDiscount[i]),
    sortOrder: i,
  }));
  const channels = new Set(selected.map((row) => row.channel));
  const channel = channels.size === 1
    ? COMMERCIAL_CHANNEL_LABELS[selected[0].channel]
    : COMMERCIAL_CHANNEL_LABELS.package;

  return {
    ...toCommercialSaleServiceInput(input),
    productId: selected.length === 1 ? selected[0].product?.id : undefined,
    channel,
    description: input.description.trim() || selected.map((row) => row.name).join(" + ").slice(0, 400),
    amount: money(subtotalCents - totalDiscountCents),
    itemsSnapshot,
  };
}
