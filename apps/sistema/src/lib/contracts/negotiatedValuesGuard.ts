/**
 * Guarda da permissão `publicidade.valores_negociar` no formulário (antigo) de
 * propostas. Valor efetivo por unidade = (quantidade × preço − desconto) ÷ quantidade.
 *
 * Só há "negociação" quando o item tem produto do catálogo COM preço de tabela e o
 * valor efetivo difere dele. Item sem produto (livre) ou produto sem preço de tabela
 * não tem referência → não é bloqueado. Na EDIÇÃO, valores que a proposta já tinha
 * (efetivo ou tabela gravada do mesmo produto) continuam permitidos: editar descrição,
 * quantidade ou outros itens nunca exige a permissão. Dependências injetáveis (sem rede).
 */

export interface GuardItem {
  productId?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
}

export interface ExistingGuardItem extends GuardItem {
  listUnitPrice?: number;
}

export interface NegotiatedValuesGuardDeps {
  /** Preço de tabela (suggestedPrice) por produto, lido no SERVIDOR. */
  loadListPrices: (productIds: string[]) => Promise<Map<string, number | undefined>>;
  /** Itens já gravados da proposta (só na edição). */
  loadExistingItems?: () => Promise<ExistingGuardItem[]>;
  canNegotiate: () => Promise<boolean>;
}

const cents = (value: number): number => Math.round(value * 100);

export function effectiveUnitPrice(item: Pick<GuardItem, "quantity" | "unitPrice" | "discountAmount">): number {
  if (!(item.quantity > 0)) return item.unitPrice;
  return (item.quantity * item.unitPrice - (item.discountAmount || 0)) / item.quantity;
}

export async function guardNegotiatedValues(items: GuardItem[], deps: NegotiatedValuesGuardDeps): Promise<string | null> {
  const productIds = [...new Set(items.map((item) => item.productId).filter((id): id is string => Boolean(id)))];
  if (productIds.length === 0) return null;
  const listPrices = await deps.loadListPrices(productIds);

  // Candidatos: tem produto com tabela e o efetivo difere dela.
  const candidates = items.filter((item) => {
    if (!item.productId) return false;
    const list = listPrices.get(item.productId);
    if (typeof list !== "number") return false;
    return cents(effectiveUnitPrice(item)) !== cents(list);
  });
  if (candidates.length === 0) return null;

  // Tudo que a proposta já tinha continua permitido (edição não é bloqueada).
  const existing = deps.loadExistingItems ? await deps.loadExistingItems() : [];
  const allowedByProduct = new Map<string, Set<number>>();
  for (const item of existing) {
    if (!item.productId) continue;
    const set = allowedByProduct.get(item.productId) ?? new Set<number>();
    set.add(cents(effectiveUnitPrice(item)));
    if (typeof item.listUnitPrice === "number") set.add(cents(item.listUnitPrice));
    allowedByProduct.set(item.productId, set);
  }
  const newlyNegotiated = candidates.filter((item) => !allowedByProduct.get(item.productId as string)?.has(cents(effectiveUnitPrice(item))));
  if (newlyNegotiated.length === 0) return null;

  if (await deps.canNegotiate()) return null;
  const first = newlyNegotiated[0];
  const label = first.description?.trim() || "item";
  return `O valor de "${label}" difere do preço de tabela do catálogo. Você não tem a permissão "Negociar valores acima/abaixo da tabela"; use o valor de tabela ou peça a liberação a um administrador.`;
}
