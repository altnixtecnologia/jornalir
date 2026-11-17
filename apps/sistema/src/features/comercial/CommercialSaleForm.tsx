"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CommercialCondition, CommercialProduct } from "@ir/types";
import { COMMERCIAL_CONDITIONS, COMMERCIAL_CONDITION_LABELS } from "@ir/types";
import { ClientPicker } from "../../components/admin/ClientPicker";
import type { ClientSearchResult } from "../../components/admin/clientSearchTypes";
import { createCommercialSaleAction } from "../../app/sistema/publicidade/vendas/novo/actions";
import {
  calculateCommercialSaleTotals,
  type CommercialSaleLineInput,
  type CommercialSaleDiscountMode,
  type CommercialSaleFormInput,
} from "../../app/sistema/publicidade/vendas/commercialSaleFormTypes";
import { notify } from "../../lib/feedback/notify";

const emptyLine = (): CommercialSaleLineInput => ({
  productId: "", manualName: "", unitPrice: "",
});

function emptyInput(): CommercialSaleFormInput {
  return {
    clientId: "",
    productId: "",
    channel: "",
    description: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    amount: "",
    commercialCondition: "cash",
    installmentsCount: "1",
    notes: "",
    items: [emptyLine()],
    discountMode: "amount",
    discountValue: "0",
  };
}

const currency = (value: number): string => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Venda direta: vários produtos, um total negociado, sem alterar o catálogo. */
export function CommercialSaleForm({ products }: { products: CommercialProduct[] }): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ClientSearchResult | null>(null);
  const [input, setInput] = useState<CommercialSaleFormInput>(emptyInput());

  const items = input.items ?? [];
  const discountMode: CommercialSaleDiscountMode = input.discountMode ?? "amount";
  const discountValue = input.discountValue ?? "0";
  const totals = useMemo(
    () => calculateCommercialSaleTotals(items, discountMode, discountValue),
    [items, discountMode, discountValue],
  );

  function set<K extends keyof CommercialSaleFormInput>(key: K, value: CommercialSaleFormInput[K]): void {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  function changeLine(index: number, change: Partial<CommercialSaleLineInput>): void {
    setInput((prev) => ({
      ...prev,
      items: (prev.items ?? []).map((line, i) => i === index ? { ...line, ...change } : line),
    }));
  }

  function chooseProduct(index: number, productId: string): void {
    const product = products.find((item) => item.id === productId);
    changeLine(index, {
      productId,
      manualName: "",
      unitPrice: product?.suggestedPrice !== undefined ? String(product.suggestedPrice) : "",
    });
  }

  function addProduct(): void {
    setInput((prev) => ({ ...prev, items: [...(prev.items ?? []), emptyLine()] }));
  }

  function removeProduct(index: number): void {
    setInput((prev) => ({
      ...prev,
      items: (prev.items ?? []).filter((_, i) => i !== index),
    }));
  }

  function handleSubmit(): void {
    setError(null);
    if (!client) {
      setError("Selecione o cliente/anunciante.");
      return;
    }
    if (!items.length || items.some((item) => (!item.productId && !item.manualName.trim()) || item.unitPrice.trim() === "")) {
      setError("Selecione ou descreva cada produto e informe seu valor.");
      return;
    }
    startTransition(async () => {
      const result = await createCommercialSaleAction({
        ...input,
        clientId: client.id,
        amount: String(totals.total),
      });
      if ("error" in result) {
        setError(result.error);
        notify.error("Não foi possível criar a venda", result.error);
        return;
      }
      notify.success("Venda criada", "Os produtos e o valor negociado foram registrados.");
      router.push(`/sistema/publicidade/vendas/${result.id}`);
    });
  }

  return (
    <section className="inline-form form-section form-section--first commercial-new-sale-form">
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="commercial-sale-top-grid">
        <div className="commercial-sale-client">
          <ClientPicker selected={client} onSelect={setClient} disabled={pending} />
        </div>
        <label className="form-field">
          <span className="field-label">Data inicial</span>
          <input type="date" value={input.startDate} onChange={(event) => set("startDate", event.target.value)} disabled={pending} />
        </label>
        <label className="form-field">
          <span className="field-label">Data final <span className="field-optional">(opcional)</span></span>
          <input type="date" value={input.endDate} onChange={(event) => set("endDate", event.target.value)} disabled={pending} />
        </label>
        <label className="form-field">
          <span className="field-label">Condição comercial</span>
          <select value={input.commercialCondition} onChange={(event) => set("commercialCondition", event.target.value as CommercialCondition)} disabled={pending}>
            {COMMERCIAL_CONDITIONS.map((value) => (
              <option key={value} value={value}>{COMMERCIAL_CONDITION_LABELS[value]}</option>
            ))}
          </select>
        </label>
      </div>

      {input.commercialCondition === "installments" ? (
        <label className="form-field commercial-sale-installments">
          <span className="field-label">Número de parcelas</span>
          <input type="number" min="1" step="1" value={input.installmentsCount}
            onChange={(event) => set("installmentsCount", event.target.value)} disabled={pending} />
        </label>
      ) : null}

      <div className="commercial-sale-products">
        <div className="commercial-sale-products-heading">
          <h2>Produtos / serviços da venda</h2>
          <button type="button" onClick={addProduct} disabled={pending || items.length >= 50} className="commercial-sale-add-product">
            + Adicionar produto
          </button>
        </div>
        <p className="helper-text">Escolha os produtos do catálogo. O preço sugerido é preenchido automaticamente e pode ser ajustado para esta venda.</p>
        <div className="commercial-sale-lines">
          {items.map((item, index) => (
            <div className="commercial-sale-line" key={index}>
              <label className="form-field commercial-sale-line-product">
                <span className="field-label">Produto {index + 1}</span>
                <select value={item.productId} onChange={(event) => chooseProduct(index, event.target.value)} disabled={pending}>
                  <option value="">Outro produto / serviço manual</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
                {!item.productId ? (
                  <input type="text" value={item.manualName} maxLength={200}
                    placeholder="Nome do produto ou serviço" aria-label={`Nome do produto ${index + 1}`}
                    onChange={(event) => changeLine(index, { manualName: event.target.value })} disabled={pending} />
                ) : null}
              </label>
              <label className="form-field commercial-sale-line-value">
                <span className="field-label">Valor (R$)</span>
                <input type="number" step="0.01" min="0" value={item.unitPrice} inputMode="decimal"
                  onChange={(event) => changeLine(index, { unitPrice: event.target.value })} disabled={pending} />
              </label>
              <button type="button" className="commercial-sale-remove-product" onClick={() => removeProduct(index)}
                disabled={pending || items.length <= 1} title="Retirar produto da venda"
                aria-label={`Remover produto ${index + 1}`}>Remover</button>
            </div>
          ))}
        </div>
        <div className="commercial-sale-totals">
          <div className="commercial-sale-subtotal">
            <span>Subtotal</span>
            <strong>{currency(totals.subtotal)}</strong>
          </div>
          <div className="commercial-sale-discount">
            <label className="field-label" htmlFor="commercial-discount-value">Desconto</label>
            <div className="commercial-sale-discount-inputs">
              <select aria-label="Tipo de desconto" value={discountMode}
                onChange={(event) => set("discountMode", event.target.value as CommercialSaleDiscountMode)} disabled={pending}>
                <option value="amount">R$</option>
                <option value="percentage">%</option>
              </select>
              <input id="commercial-discount-value" type="number" min="0" step="0.01"
                max={discountMode === "percentage" ? "100" : undefined}
                value={discountValue} onChange={(event) => set("discountValue", event.target.value)} disabled={pending} />
              <span className="commercial-sale-discount-applied">− {currency(totals.discount)}</span>
            </div>
          </div>
          <div className="commercial-sale-total" aria-live="polite">
            <span>Total da venda</span>
            <strong>{currency(totals.total)}</strong>
          </div>
        </div>
      </div>

      <div className="commercial-sale-bottom-fields">
        <label className="form-field">
          <span className="field-label">Descrição geral <span className="field-optional">(opcional)</span></span>
          <input type="text" value={input.description} onChange={(event) => set("description", event.target.value)}
            placeholder="Se ficar vazio, será montada com os produtos escolhidos" disabled={pending} />
        </label>
        <label className="form-field">
          <span className="field-label">Observações <span className="field-optional">(opcional)</span></span>
          <textarea rows={3} value={input.notes} onChange={(event) => set("notes", event.target.value)} disabled={pending} />
        </label>
      </div>

      <div className="form-actions">
        <button type="button" className="form-action-primary" onClick={handleSubmit} disabled={pending}>
          {pending ? "Salvando…" : "Criar venda"}
        </button>
      </div>
    </section>
  );
}
