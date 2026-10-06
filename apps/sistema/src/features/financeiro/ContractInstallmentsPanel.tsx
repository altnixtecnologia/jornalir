"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InstitutionalContract } from "@ir/types";
import { generateContractInstallments, type InstallmentDraft } from "@ir/core";
import { generateContractInstallmentsAction, type InstallmentPayload } from "../../app/sistema/financeiro/contas-a-receber/actions";

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function draftToPayload(draft: InstallmentDraft): InstallmentPayload {
  const { input } = draft;
  return {
    index: draft.index,
    clientId: input.clientId,
    description: input.description,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? "",
    sourceReference: input.sourceReference ?? "",
    subscriptionId: "",
    contractId: input.contractId ?? "",
    originalAmount: String(input.originalAmount),
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    competencyDate: input.competencyDate ?? "",
    notes: "",
  };
}

/**
 * "Gerar parcelas/competências" (Parte 3B, item 7) — ferramenta de
 * conveniência, NUNCA presume que todo contrato é parcelado igualmente
 * (o usuário decide quantidade/valor/intervalo e confirma explicitamente
 * cada parcela na prévia, podendo ajustar valor/competência/vencimento/
 * descrição individualmente antes de salvar). Contratos não têm a
 * restrição de unicidade por competência das assinaturas — "podem ter
 * múltiplos títulos legítimos no mesmo mês".
 */
export function ContractInstallmentsPanel({ contract }: { contract: InstitutionalContract }): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [count, setCount] = useState("12");
  const [totalAmount, setTotalAmount] = useState(contract.contractedAmount ? String(contract.contractedAmount) : "");
  const [firstCompetency, setFirstCompetency] = useState(new Date().toISOString().slice(0, 10));
  const [firstDueDate, setFirstDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [drafts, setDrafts] = useState<InstallmentDraft[] | null>(null);
  const [results, setResults] = useState<{ competencyDate: string; ok: boolean; error?: string }[] | null>(null);

  function buildPreview(): void {
    setError(null);
    setResults(null);
    const parsedCount = Math.max(1, Math.min(60, Number(count) || 1));
    const parsedTotal = Number(totalAmount.replace(",", "."));
    if (!Number.isFinite(parsedTotal) || parsedTotal <= 0) {
      setError("Informe o valor total a dividir entre as parcelas.");
      return;
    }
    const generated = generateContractInstallments(contract, {
      count: parsedCount,
      firstCompetencyDate: firstCompetency,
      firstDueDate,
      totalAmount: parsedTotal,
    });
    setDrafts(generated);
  }

  function updateDraft(index: number, key: "originalAmount" | "competencyDate" | "dueDate" | "description", value: string): void {
    setDrafts((prev) =>
      prev
        ? prev.map((draft, draftIndex) =>
            draftIndex === index
              ? {
                  ...draft,
                  competencyDate: key === "competencyDate" ? value : draft.competencyDate,
                  dueDate: key === "dueDate" ? value : draft.dueDate,
                  input: {
                    ...draft.input,
                    originalAmount: key === "originalAmount" ? Number(value.replace(",", ".")) || 0 : draft.input.originalAmount,
                    competencyDate: key === "competencyDate" ? value : draft.input.competencyDate,
                    dueDate: key === "dueDate" ? value : draft.input.dueDate,
                    description: key === "description" ? value : draft.input.description,
                  },
                }
              : draft,
          )
        : prev,
    );
  }

  function confirm(): void {
    if (!drafts) return;
    setError(null);
    startTransition(async () => {
      const { results: actionResults } = await generateContractInstallmentsAction(drafts.map((draft) => draftToPayload(draft)));
      setResults(actionResults);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="form-actions">
        <button type="button" onClick={() => setOpen(true)}>
          Gerar parcelas/competências
        </button>
      </div>
    );
  }

  return (
    <div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-grid">
        <label className="form-field">
          <span className="field-label">Quantidade de parcelas</span>
          <input type="number" min={1} max={60} value={count} onChange={(event) => setCount(event.target.value)} />
        </label>
        <label className="form-field">
          <span className="field-label">Valor total a dividir (R$)</span>
          <input type="text" inputMode="decimal" value={totalAmount} onChange={(event) => setTotalAmount(event.target.value)} placeholder="0,00" />
        </label>
        <label className="form-field">
          <span className="field-label">Primeira competência</span>
          <input type="date" value={firstCompetency} onChange={(event) => setFirstCompetency(event.target.value)} />
        </label>
        <label className="form-field">
          <span className="field-label">Primeiro vencimento</span>
          <input type="date" value={firstDueDate} onChange={(event) => setFirstDueDate(event.target.value)} />
        </label>
      </div>
      <p className="helper-text">A divisão automática do valor total é só uma conveniência — ajuste qualquer parcela na prévia abaixo.</p>
      <div className="form-actions">
        <button type="button" className="form-action-primary" onClick={buildPreview} disabled={pending}>
          Gerar prévia
        </button>
        {drafts ? (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setDrafts(null);
            }}
            disabled={pending}
          >
            Fechar
          </button>
        ) : null}
      </div>

      {drafts ? (
        <>
          <div className="materias-table-wrap" style={{ marginTop: "12px" }}>
            <table className="materias-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Competência</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Descrição</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft, index) => (
                  <tr key={draft.index}>
                    <td>{draft.index}</td>
                    <td>
                      <input
                        type="date"
                        value={draft.competencyDate}
                        onChange={(event) => updateDraft(index, "competencyDate", event.target.value)}
                      />
                    </td>
                    <td>
                      <input type="date" value={draft.dueDate} onChange={(event) => updateDraft(index, "dueDate", event.target.value)} />
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="decimal"
                        style={{ width: "100px" }}
                        value={String(draft.input.originalAmount)}
                        onChange={(event) => updateDraft(index, "originalAmount", event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        style={{ width: "260px" }}
                        value={draft.input.description}
                        onChange={(event) => updateDraft(index, "description", event.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {results ? (
            <ul className="helper-text">
              {results.map((result) => (
                <li key={result.competencyDate}>
                  {formatDate(result.competencyDate)}: {result.ok ? "gerada com sucesso" : `falhou — ${result.error}`}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="form-actions" style={{ marginTop: "12px" }}>
            <button type="button" className="form-action-primary" onClick={confirm} disabled={pending}>
              {pending ? "Gerando…" : `Confirmar geração das ${drafts.length} parcelas`}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
