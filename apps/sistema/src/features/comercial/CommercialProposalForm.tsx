"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CommercialCondition, CommercialProduct, CommercialProposalWithItems } from "@ir/types";
import { COMMERCIAL_CONDITIONS, COMMERCIAL_CONDITION_LABELS, computeProposalItemTotal } from "@ir/types";
import { ClientPicker } from "../../components/admin/ClientPicker";
import type { ClientSearchResult } from "../../components/admin/clientSearchTypes";
import { createCommercialProposalAction } from "../../app/sistema/publicidade/propostas/novo/actions";
import { updateCommercialProposalAction } from "../../app/sistema/publicidade/propostas/[id]/actions";
import type { CommercialProposalFormInput, CommercialProposalItemFormInput } from "../../app/sistema/publicidade/propostas/commercialProposalFormTypes";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function emptyItem(): CommercialProposalItemFormInput {
  return { productId: "", description: "", quantity: "1", unitPrice: "", discountAmount: "0" };
}

function emptyInput(initialClientId?: string): CommercialProposalFormInput {
  return {
    clientId: initialClientId ?? "",
    proposalDate: new Date().toISOString().slice(0, 10),
    validUntil: "",
    commercialCondition: "cash",
    notes: "",
    internalNotes: "",
    items: [emptyItem()],
  };
}

function toInput(proposal: CommercialProposalWithItems): CommercialProposalFormInput {
  return {
    clientId: proposal.clientId,
    proposalDate: proposal.proposalDate,
    validUntil: proposal.validUntil ?? "",
    commercialCondition: proposal.commercialCondition,
    notes: proposal.notes ?? "",
    internalNotes: proposal.internalNotes ?? "",
    items: proposal.items.length
      ? proposal.items.map((item) => ({
          productId: item.productId ?? "",
          description: item.description,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
          discountAmount: String(item.discountAmount),
        }))
      : [emptyItem()],
  };
}

/**
 * Formulário de proposta/orçamento — cria ou edita (mode). Itens em
 * linhas repetíveis; total sempre calculado na tela, nunca digitado
 * (mesmo princípio de computeProposalItemTotal/computeProposalTotal —
 * nunca uma coluna gravada).
 */
export function CommercialProposalForm({
  mode,
  proposal,
  products,
  initialSelectedClient,
}: {
  mode: "create" | "edit";
  proposal?: CommercialProposalWithItems;
  products: CommercialProduct[];
  initialSelectedClient?: ClientSearchResult | null;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ClientSearchResult | null>(initialSelectedClient ?? null);
  const [input, setInput] = useState<CommercialProposalFormInput>(proposal ? toInput(proposal) : emptyInput());

  function set<K extends keyof CommercialProposalFormInput>(key: K, value: CommercialProposalFormInput[K]): void {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  function setItem(index: number, key: keyof CommercialProposalItemFormInput, value: string): void {
    setInput((prev) => ({ ...prev, items: prev.items.map((item, i) => (i === index ? { ...item, [key]: value } : item)) }));
  }

  function handleSelectProduct(index: number, productId: string): void {
    const product = products.find((p) => p.id === productId);
    setInput((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index
          ? {
              ...item,
              productId,
              description: item.description || product?.name || "",
              unitPrice: item.unitPrice || (product?.suggestedPrice !== undefined ? String(product.suggestedPrice) : item.unitPrice),
            }
          : item,
      ),
    }));
  }

  function addItem(): void {
    setInput((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));
  }

  function removeItem(index: number): void {
    setInput((prev) => ({ ...prev, items: prev.items.length > 1 ? prev.items.filter((_, i) => i !== index) : prev.items }));
  }

  const total = input.items.reduce(
    (sum, item) =>
      sum + computeProposalItemTotal({ quantity: Number(item.quantity || "0"), unitPrice: Number(item.unitPrice || "0"), discountAmount: Number(item.discountAmount || "0") }),
    0,
  );

  function handleSubmit(): void {
    setError(null);
    if (mode === "create" && !client) {
      setError("Selecione o cliente.");
      return;
    }
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createCommercialProposalAction({ ...input, clientId: client!.id })
          : await updateCommercialProposalAction(proposal!.id, input);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      if (mode === "create" && result && "id" in result) {
        router.push(`/sistema/publicidade/propostas/${result.id}`);
        return;
      }
      router.push(`/sistema/publicidade/propostas/${proposal!.id}`);
    });
  }

  return (
    <section className="inline-form form-section form-section--first">
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="form-grid">
        {mode === "create" ? (
          <div className="form-field" style={{ gridColumn: "1 / -1" }}>
            <ClientPicker selected={client} onSelect={setClient} disabled={pending} />
          </div>
        ) : null}

        <label className="form-field">
          <span className="field-label">Data da proposta</span>
          <input type="date" value={input.proposalDate} onChange={(event) => set("proposalDate", event.target.value)} disabled={pending} />
        </label>
        <label className="form-field">
          <span className="field-label">Validade <span className="field-optional">(opcional)</span></span>
          <input type="date" value={input.validUntil} onChange={(event) => set("validUntil", event.target.value)} disabled={pending} />
        </label>
        <label className="form-field">
          <span className="field-label">Condição comercial</span>
          <select value={input.commercialCondition} onChange={(event) => set("commercialCondition", event.target.value as CommercialCondition)} disabled={pending}>
            {COMMERCIAL_CONDITIONS.map((value) => (
              <option key={value} value={value}>
                {COMMERCIAL_CONDITION_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h3 style={{ marginTop: "20px" }}>Itens</h3>
      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Descrição</th>
              <th>Qtd.</th>
              <th>Valor unit.</th>
              <th>Desconto</th>
              <th>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {input.items.map((item, index) => (
              <tr key={index}>
                <td>
                  <select value={item.productId} onChange={(event) => handleSelectProduct(index, event.target.value)} disabled={pending}>
                    <option value="">—</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input type="text" style={{ minWidth: "220px" }} value={item.description} onChange={(event) => setItem(index, "description", event.target.value)} disabled={pending} />
                </td>
                <td>
                  <input type="number" min="0.01" step="0.01" style={{ width: "70px" }} value={item.quantity} onChange={(event) => setItem(index, "quantity", event.target.value)} disabled={pending} />
                </td>
                <td>
                  <input type="number" min="0" step="0.01" style={{ width: "100px" }} value={item.unitPrice} onChange={(event) => setItem(index, "unitPrice", event.target.value)} disabled={pending} />
                </td>
                <td>
                  <input type="number" min="0" step="0.01" style={{ width: "100px" }} value={item.discountAmount} onChange={(event) => setItem(index, "discountAmount", event.target.value)} disabled={pending} />
                </td>
                <td>
                  {formatAmount(
                    computeProposalItemTotal({ quantity: Number(item.quantity || "0"), unitPrice: Number(item.unitPrice || "0"), discountAmount: Number(item.discountAmount || "0") }),
                  )}
                </td>
                <td>
                  <button type="button" onClick={() => removeItem(index)} disabled={pending || input.items.length === 1}>
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={{ textAlign: "right" }}>
                <strong>Total</strong>
              </td>
              <td>
                <strong>{formatAmount(total)}</strong>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="form-actions" style={{ marginTop: "8px" }}>
        <button type="button" onClick={addItem} disabled={pending}>
          + Adicionar item
        </button>
      </div>

      <div className="form-grid" style={{ marginTop: "12px" }}>
        <label className="form-field" style={{ gridColumn: "1 / -1" }}>
          <span className="field-label">Observações (aparecem na proposta impressa) <span className="field-optional">(opcional)</span></span>
          <textarea rows={2} value={input.notes} onChange={(event) => set("notes", event.target.value)} disabled={pending} />
        </label>
        <label className="form-field" style={{ gridColumn: "1 / -1" }}>
          <span className="field-label">Observação interna <span className="field-optional">(opcional, nunca aparece na proposta impressa)</span></span>
          <textarea rows={2} value={input.internalNotes} onChange={(event) => set("internalNotes", event.target.value)} disabled={pending} />
        </label>
      </div>

      <div className="form-actions">
        <button type="button" className="form-action-primary" onClick={handleSubmit} disabled={pending}>
          {pending ? "Salvando…" : mode === "create" ? "Criar proposta" : "Salvar"}
        </button>
      </div>
    </section>
  );
}
