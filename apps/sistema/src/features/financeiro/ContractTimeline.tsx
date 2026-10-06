import type { ContractTimelineEntry } from "@ir/types";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

const KIND_ICON: Record<ContractTimelineEntry["kind"], string> = {
  contract_start: "▶",
  document: "📄",
  amendment: "✎",
  commitment_order: "🔖",
  receivable: "🧾",
  receipt: "💰",
  contract_end: "■",
};

/**
 * Linha do tempo do contrato (Bloco 2, item 8) — simples de propósito,
 * só reorganiza o que já existe (buildContractTimeline, puro, em
 * @ir/types). Objetivo é entender rápido o histórico, não uma
 * visualização exagerada.
 */
export function ContractTimeline({ entries }: { entries: ContractTimelineEntry[] }): JSX.Element {
  if (entries.length === 0) {
    return <p className="helper-text">Nenhum evento registrado ainda.</p>;
  }
  return (
    <ul className="destaques-list">
      {entries.map((entry, index) => (
        <li key={index} className="destaques-item">
          <div className="destaques-item-body">
            <span className="materia-title">
              {KIND_ICON[entry.kind]} {entry.label}
              {entry.amount !== undefined ? ` — ${formatAmount(entry.amount)}` : ""}
            </span>
            <span className="helper-text">{formatDate(entry.date)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
