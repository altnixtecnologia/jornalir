"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CommercialChannel, CommercialProduct } from "@ir/types";
import { COMMERCIAL_CHANNELS, COMMERCIAL_CHANNEL_LABELS } from "@ir/types";
import {
  createCommercialProductAction,
  deactivateCommercialProductAction,
  reactivateCommercialProductAction,
  updateCommercialProductAction,
  type CommercialProductFormInput,
} from "../../app/sistema/publicidade/produtos/actions";
import { notify } from "../../lib/feedback/notify";

function emptyInput(): CommercialProductFormInput {
  return { name: "", channel: "newspaper", description: "", suggestedPrice: "" };
}

function toInput(product: CommercialProduct): CommercialProductFormInput {
  return {
    name: product.name,
    channel: product.channel,
    description: product.description ?? "",
    suggestedPrice: product.suggestedPrice !== undefined ? String(product.suggestedPrice) : "",
  };
}

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Catálogo de produtos/canais comerciais — evita digitar canal/preço
 * sugerido do zero em cada venda. Nunca excluído — só desativado/
 * reativado (mesmo princípio dos Perfis de serviço da NFS-e).
 */
export function CommercialProductsPanel({ products }: { products: CommercialProduct[] }): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [input, setInput] = useState<CommercialProductFormInput>(emptyInput());

  function startCreate(): void {
    setInput(emptyInput());
    setEditingId("new");
  }

  function startEdit(product: CommercialProduct): void {
    setInput(toInput(product));
    setEditingId(product.id);
  }

  function cancel(): void {
    setEditingId(null);
  }

  function set<K extends keyof CommercialProductFormInput>(key: K, value: CommercialProductFormInput[K]): void {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  function save(): void {
    const wasCreating = editingId === "new";
    startTransition(async () => {
      const result = editingId === "new" ? await createCommercialProductAction(input) : await updateCommercialProductAction(editingId as string, input);
      if (result && "error" in result) {
        notify.error("Não foi possível salvar o produto", result.error);
        return;
      }
      setEditingId(null);
      notify.success(wasCreating ? "Produto criado" : "Produto atualizado",
        wasCreating ? "O produto foi adicionado ao catálogo." : "As alterações do produto foram salvas.");
      router.refresh();
    });
  }

  function toggleActive(product: CommercialProduct): void {
    startTransition(async () => {
      const result = product.active ? await deactivateCommercialProductAction(product.id) : await reactivateCommercialProductAction(product.id);
      if (result && "error" in result) {
        notify.error("Não foi possível alterar o produto", result.error);
        return;
      }
      notify.success(product.active ? "Produto desativado" : "Produto reativado",
        product.name + (product.active ? " não aparece mais para novas vendas." : " voltou a aparecer para novas vendas."));
      router.refresh();
    });
  }

  return (
    <section className="inline-form form-section form-section--first">
      <h2>Produtos/canais</h2>

      {editingId === null ? (
        <div className="form-actions">
          <button type="button" className="form-action-primary" onClick={startCreate} disabled={pending}>
            Novo produto
          </button>
        </div>
      ) : (
        <div className="form-grid" style={{ marginTop: "12px" }}>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Nome</span>
            <input type="text" value={input.name} onChange={(event) => set("name", event.target.value)} placeholder="ex.: Classificado — edição impressa" />
          </label>
          <label className="form-field">
            <span className="field-label">Canal</span>
            <select value={input.channel} onChange={(event) => set("channel", event.target.value as CommercialChannel)}>
              {COMMERCIAL_CHANNELS.map((value) => (
                <option key={value} value={value}>
                  {COMMERCIAL_CHANNEL_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="field-label">Preço sugerido <span className="field-optional">(opcional)</span></span>
            <input type="number" min="0" step="0.01" value={input.suggestedPrice} onChange={(event) => set("suggestedPrice", event.target.value)} />
            <span className="helper-text">Só sugestão — a venda pode usar outro valor.</span>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Descrição <span className="field-optional">(opcional)</span></span>
            <textarea rows={2} value={input.description} onChange={(event) => set("description", event.target.value)} />
          </label>
          <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
            <button type="button" className="form-action-primary" onClick={save} disabled={pending}>
              {pending ? "Salvando…" : "Salvar produto"}
            </button>
            <button type="button" onClick={cancel} disabled={pending}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {products.length === 0 ? (
        <p className="helper-text" style={{ marginTop: "12px" }}>
          Nenhum produto cadastrado ainda.
        </p>
      ) : (
        <div className="materias-table-wrap" style={{ marginTop: "12px" }}>
          <table className="materias-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Canal</th>
                <th>Preço sugerido</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{COMMERCIAL_CHANNEL_LABELS[product.channel]}</td>
                  <td>{product.suggestedPrice !== undefined ? formatAmount(product.suggestedPrice) : "—"}</td>
                  <td>
                    <span className={`status-pill ${product.active ? "status-pill--published" : "status-pill--archived"}`}>
                      {product.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>
                    <div className="form-actions">
                      <button type="button" onClick={() => startEdit(product)} disabled={pending}>
                        Editar
                      </button>
                      <button type="button" onClick={() => toggleActive(product)} disabled={pending}>
                        {product.active ? "Desativar" : "Reativar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
