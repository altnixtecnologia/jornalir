"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PaymentMethod } from "@ir/types";
import { PAYMENT_METHOD_LABELS } from "@ir/types";

export interface RecibosTableRow {
  id: string;
  receivedAt: string;
  clientName: string;
  receivableReference: string;
  amount: number;
  paymentMethod?: PaymentMethod;
  reversedAt?: string;
}

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

/**
 * Tabela de Recibos com seleção (Fase 7) — client component pra guardar
 * quais checkboxes estão marcados e montar o link de "Imprimir
 * selecionados" (nunca reaproveita o filtro ativo/todos/cancelados da
 * listagem, só os ids marcados pelo usuário).
 */
export function RecibosTable({ rows }: { rows: RecibosTableRow[] }): JSX.Element {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(): void {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((row) => row.id))));
  }

  function printSelected(): void {
    if (selected.size === 0) return;
    router.push(`/sistema/financeiro/recibos/imprimir?ids=${Array.from(selected).join(",")}`);
  }

  return (
    <div>
      <div className="recibos-selection-actions" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={printSelected} disabled={selected.size === 0}>
          Imprimir selecionados ({selected.size})
        </button>
      </div>

      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Selecionar todos"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={toggleAll}
                />
              </th>
              <th>Data</th>
              <th>Cliente</th>
              <th>Referência</th>
              <th>Valor</th>
              <th>Forma</th>
              <th>Status</th>
              <th>Imprimir</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Selecionar recibo de ${row.clientName}`}
                    checked={selected.has(row.id)}
                    onChange={() => toggle(row.id)}
                  />
                </td>
                <td>{formatDateTime(row.receivedAt)}</td>
                <td>{row.clientName}</td>
                <td>{row.receivableReference}</td>
                <td>{formatAmount(row.amount)}</td>
                <td>{row.paymentMethod ? PAYMENT_METHOD_LABELS[row.paymentMethod] : "—"}</td>
                <td>{row.reversedAt ? "Cancelado" : "Ativo"}</td>
                <td>
                  <Link className="secondary-link" href={`/sistema/financeiro/recibos/imprimir?ids=${row.id}`}>
                    Imprimir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="helper-text">Nenhum recibo encontrado com o filtro atual.</p> : null}
      </div>
    </div>
  );
}
