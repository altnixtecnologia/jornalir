"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CommercialCondition, CommercialProduct } from "@ir/types";
import { COMMERCIAL_CHANNEL_LABELS, COMMERCIAL_CONDITIONS, COMMERCIAL_CONDITION_LABELS } from "@ir/types";
import { ClientPicker } from "../../components/admin/ClientPicker";
import type { ClientSearchResult } from "../../components/admin/clientSearchTypes";
import { createCommercialSaleAction } from "../../app/sistema/publicidade/vendas/novo/actions";
import type { CommercialSaleFormInput } from "../../app/sistema/publicidade/vendas/commercialSaleFormTypes";
import { notify } from "../../lib/feedback/notify";

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
  };
}

/**
 * Nova venda comercial (publicidade) — formulário simples (item 8):
 * Cadastro (ClientPicker único, nunca "Buscar cliente" + "Cliente"
 * duplicados), Produto/Tipo de publicidade, Descrição, Período, Valor,
 * Condição comercial, Observações. Produto escolhido do catálogo
 * preenche o canal (texto, snapshot) automaticamente — "Outro"/sem
 * produto deixa o canal livre pra digitar.
 */
export function CommercialSaleForm({ products }: { products: CommercialProduct[] }): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ClientSearchResult | null>(null);
  const [input, setInput] = useState<CommercialSaleFormInput>(emptyInput());

  function set<K extends keyof CommercialSaleFormInput>(key: K, value: CommercialSaleFormInput[K]): void {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  function handleSelectProduct(productId: string): void {
    const product = products.find((p) => p.id === productId);
    setInput((prev) => ({
      ...prev,
      productId,
      channel: product ? COMMERCIAL_CHANNEL_LABELS[product.channel] : prev.channel,
      amount: prev.amount || (product?.suggestedPrice !== undefined ? String(product.suggestedPrice) : prev.amount),
    }));
  }

  function handleSubmit(): void {
    setError(null);
    if (!client) {
      setError("Selecione o cliente/anunciante.");
      return;
    }
    startTransition(async () => {
      const result = await createCommercialSaleAction({ ...input, clientId: client.id });
      if ("error" in result) {
        notify.error("Não foi possível criar a venda", result.error);
        return;
      }
      notify.success("Venda criada", "A venda foi registrada.");
      router.push(`/sistema/publicidade/vendas/${result.id}`);
    });
  }

  return (
    <section className="inline-form form-section form-section--first">
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="form-grid">
        <div className="form-field" style={{ gridColumn: "1 / -1" }}>
          <ClientPicker selected={client} onSelect={setClient} disabled={pending} />
        </div>

        <label className="form-field">
          <span className="field-label">Produto/tipo de publicidade <span className="field-optional">(opcional)</span></span>
          <select value={input.productId} onChange={(event) => handleSelectProduct(event.target.value)} disabled={pending}>
            <option value="">— Digitar manualmente —</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span className="field-label">Canal</span>
          <input type="text" value={input.channel} onChange={(event) => set("channel", event.target.value)} placeholder="ex.: Jornal impresso" disabled={pending} />
        </label>

        <label className="form-field" style={{ gridColumn: "1 / -1" }}>
          <span className="field-label">Descrição</span>
          <input
            type="text"
            value={input.description}
            onChange={(event) => set("description", event.target.value)}
            placeholder="ex.: Classificado — edição de outubro/2026"
            disabled={pending}
          />
        </label>

        <label className="form-field">
          <span className="field-label">Data inicial</span>
          <input type="date" value={input.startDate} onChange={(event) => set("startDate", event.target.value)} disabled={pending} />
        </label>
        <label className="form-field">
          <span className="field-label">Data final <span className="field-optional">(opcional)</span></span>
          <input type="date" value={input.endDate} onChange={(event) => set("endDate", event.target.value)} disabled={pending} />
        </label>

        <label className="form-field">
          <span className="field-label">Valor</span>
          <input type="number" min="0" step="0.01" value={input.amount} onChange={(event) => set("amount", event.target.value)} disabled={pending} />
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

        {input.commercialCondition === "installments" ? (
          <label className="form-field">
            <span className="field-label">Número de parcelas</span>
            <input type="number" min="1" step="1" value={input.installmentsCount} onChange={(event) => set("installmentsCount", event.target.value)} disabled={pending} />
          </label>
        ) : null}

        <label className="form-field" style={{ gridColumn: "1 / -1" }}>
          <span className="field-label">Observações <span className="field-optional">(opcional)</span></span>
          <textarea rows={2} value={input.notes} onChange={(event) => set("notes", event.target.value)} disabled={pending} />
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
