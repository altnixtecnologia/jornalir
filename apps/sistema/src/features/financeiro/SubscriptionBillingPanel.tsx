"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ReceivableWithBalance, Subscription } from "@ir/types";
import { RECEIVABLE_STATUS_LABELS } from "@ir/types";
import { buildReceivableFromSubscription, buildReceivablesForPeriod, suggestNextCompetencyDate, type SubscriptionReceivableDraft } from "@ir/core";
import {
  generateReceivableFromSubscriptionAction,
  generateReceivablesForSubscriptionPeriodAction,
} from "../../app/sistema/financeiro/contas-a-receber/actions";
import type { ReceivableFormPayload } from "./receivableFormTypes";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function statusPillClass(status: ReceivableWithBalance["status"]): string {
  if (status === "paid") return "status-pill status-pill--published";
  if (status === "partially_paid") return "status-pill status-pill--adjusting";
  if (status === "cancelled") return "status-pill status-pill--archived";
  return "status-pill status-pill--scheduled";
}

function draftToPayload(draft: SubscriptionReceivableDraft): ReceivableFormPayload {
  const { input } = draft;
  return {
    clientId: input.clientId,
    description: input.description,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? "",
    sourceReference: input.sourceReference ?? "",
    subscriptionId: input.subscriptionId ?? "",
    contractId: "",
    originalAmount: String(input.originalAmount),
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    competencyDate: input.competencyDate ?? "",
    notes: "",
  };
}

/**
 * "Cobranças" na página da Assinatura (Parte 3B, itens 2-5): títulos já
 * gerados + "Gerar cobrança" (uma competência) e "Gerar período" (N
 * competências, com PRÉVIA editável/desmarcável antes de confirmar —
 * nunca grava nada silenciosamente). A proteção contra duplicidade real
 * é do ReceivableService/banco (índice único); esta tela só evita o
 * usuário tentar à toa (mostra "já existe" quando aplicável).
 */
export function SubscriptionBillingPanel({
  subscription,
  receivables,
  clientName,
}: {
  subscription: Subscription;
  receivables: ReceivableWithBalance[];
  clientName: string;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "single" | "period">("none");

  const existingCompetencies = useMemo(() => new Set(receivables.map((item) => item.competencyDate).filter(Boolean)), [receivables]);

  // --- Geração única ---
  const [singleDraft, setSingleDraft] = useState<SubscriptionReceivableDraft | null>(null);

  function openSingle(): void {
    setError(null);
    const competency = suggestNextCompetencyDate(subscription);
    setSingleDraft(buildReceivableFromSubscription(subscription, competency));
    setMode("single");
  }

  function updateSingleField<K extends keyof SubscriptionReceivableDraft["input"]>(key: K, value: SubscriptionReceivableDraft["input"][K]): void {
    setSingleDraft((prev) => (prev ? { ...prev, input: { ...prev.input, [key]: value } } : prev));
  }

  function confirmSingle(): void {
    if (!singleDraft) return;
    setError(null);
    startTransition(async () => {
      const result = await generateReceivableFromSubscriptionAction(draftToPayload(singleDraft));
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("none");
      setSingleDraft(null);
      router.refresh();
    });
  }

  // --- Geração de período ---
  const [periodCount, setPeriodCount] = useState("3");
  const [periodDrafts, setPeriodDrafts] = useState<(SubscriptionReceivableDraft & { selected: boolean })[] | null>(null);
  const [periodResults, setPeriodResults] = useState<{ competencyDate: string; ok: boolean; error?: string }[] | null>(null);

  function openPeriod(): void {
    setError(null);
    setPeriodResults(null);
    const count = Math.max(1, Math.min(24, Number(periodCount) || 1));
    const first = suggestNextCompetencyDate(subscription);
    const drafts = buildReceivablesForPeriod(subscription, count, first).map((draft) => ({
      ...draft,
      selected: !existingCompetencies.has(draft.competencyDate),
    }));
    setPeriodDrafts(drafts);
    setMode("period");
  }

  function toggleDraft(index: number): void {
    setPeriodDrafts((prev) => (prev ? prev.map((item, itemIndex) => (itemIndex === index ? { ...item, selected: !item.selected } : item)) : prev));
  }

  function updatePeriodDraftField(index: number, key: keyof SubscriptionReceivableDraft["input"], value: string | number): void {
    setPeriodDrafts((prev) =>
      prev ? prev.map((item, itemIndex) => (itemIndex === index ? { ...item, input: { ...item.input, [key]: value } } : item)) : prev,
    );
  }

  function confirmPeriod(): void {
    if (!periodDrafts) return;
    const selected = periodDrafts.filter((draft) => draft.selected);
    if (selected.length === 0) {
      setError("Selecione ao menos uma competência para gerar.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const { results } = await generateReceivablesForSubscriptionPeriodAction(selected.map((draft) => draftToPayload(draft)));
      setPeriodResults(results);
      router.refresh();
    });
  }

  return (
    <section className="form-section">
      <div className="destaques-block-head">
        <h2>Cobranças</h2>
        {mode === "none" ? (
          <div className="form-actions" style={{ margin: 0 }}>
            <button type="button" onClick={openSingle} disabled={pending}>
              Gerar cobrança
            </button>
            <button type="button" onClick={openPeriod} disabled={pending}>
              Gerar período
            </button>
          </div>
        ) : null}
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {mode === "single" && singleDraft ? (
        <div className="form-grid" style={{ marginTop: "12px" }}>
          <p className="helper-text" style={{ gridColumn: "1 / -1" }}>
            Revise antes de confirmar — tudo abaixo pode ser editado.
          </p>
          <div className="form-field">
            <span className="field-label">Cliente</span>
            <span>{clientName}</span>
          </div>
          <label className="form-field">
            <span className="field-label">Descrição</span>
            <input type="text" value={singleDraft.input.description} onChange={(event) => updateSingleField("description", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Valor (R$)</span>
            <input
              type="text"
              inputMode="decimal"
              value={String(singleDraft.input.originalAmount)}
              onChange={(event) => updateSingleField("originalAmount", Number(event.target.value.replace(",", ".")) || 0)}
            />
          </label>
          <label className="form-field">
            <span className="field-label">Competência</span>
            <input type="date" value={singleDraft.input.competencyDate ?? ""} onChange={(event) => updateSingleField("competencyDate", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Vencimento</span>
            <input type="date" value={singleDraft.input.dueDate} onChange={(event) => updateSingleField("dueDate", event.target.value)} />
          </label>
          <div className="form-field">
            <span className="field-label">Origem</span>
            <span>{singleDraft.input.sourceReference}</span>
          </div>
          {existingCompetencies.has(singleDraft.input.competencyDate ?? "") ? (
            <p className="form-error" style={{ gridColumn: "1 / -1" }}>
              Já existe uma cobrança para esta competência.
            </p>
          ) : null}
          <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
            <button type="button" className="form-action-primary" onClick={confirmSingle} disabled={pending}>
              {pending ? "Gerando…" : "Confirmar geração"}
            </button>
            <button type="button" onClick={() => setMode("none")} disabled={pending}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {mode === "period" && periodDrafts ? (
        <div style={{ marginTop: "12px" }}>
          <div className="form-grid">
            <label className="form-field">
              <span className="field-label">Quantidade de competências</span>
              <input type="number" min={1} max={24} value={periodCount} onChange={(event) => setPeriodCount(event.target.value)} />
            </label>
            <div className="form-actions">
              <button type="button" onClick={openPeriod} disabled={pending}>
                Recalcular prévia
              </button>
            </div>
          </div>

          <p className="helper-text">Prévia — desmarque o que não quiser gerar agora; tudo pode ser ajustado antes de confirmar.</p>

          <div className="materias-table-wrap">
            <table className="materias-table">
              <thead>
                <tr>
                  <th />
                  <th>Competência</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Descrição</th>
                </tr>
              </thead>
              <tbody>
                {periodDrafts.map((draft, index) => {
                  const duplicate = existingCompetencies.has(draft.input.competencyDate ?? "");
                  return (
                    <tr key={draft.competencyDate} className={duplicate ? "subscription-row--overdue" : undefined}>
                      <td>
                        <input type="checkbox" checked={draft.selected} onChange={() => toggleDraft(index)} disabled={duplicate} />
                      </td>
                      <td>
                        {formatDate(draft.input.competencyDate)}
                        {duplicate ? <span className="status-pill status-pill--overdue">Já existe</span> : null}
                      </td>
                      <td>
                        <input type="date" value={draft.input.dueDate} onChange={(event) => updatePeriodDraftField(index, "dueDate", event.target.value)} />
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          style={{ width: "100px" }}
                          value={String(draft.input.originalAmount)}
                          onChange={(event) => updatePeriodDraftField(index, "originalAmount", Number(event.target.value.replace(",", ".")) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          style={{ width: "220px" }}
                          value={draft.input.description}
                          onChange={(event) => updatePeriodDraftField(index, "description", event.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {periodResults ? (
            <ul className="helper-text">
              {periodResults.map((result) => (
                <li key={result.competencyDate}>
                  {formatDate(result.competencyDate)}: {result.ok ? "gerada com sucesso" : `falhou — ${result.error}`}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="form-actions" style={{ marginTop: "12px" }}>
            <button type="button" className="form-action-primary" onClick={confirmPeriod} disabled={pending}>
              {pending ? "Gerando…" : "Confirmar geração das selecionadas"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("none");
                setPeriodDrafts(null);
                setPeriodResults(null);
              }}
              disabled={pending}
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      {receivables.length === 0 ? (
        <p className="helper-text" style={{ marginTop: "12px" }}>
          Nenhuma cobrança gerada ainda para esta assinatura.
        </p>
      ) : (
        <div className="materias-table-wrap" style={{ marginTop: "12px" }}>
          <table className="materias-table">
            <thead>
              <tr>
                <th>Referência</th>
                <th>Competência</th>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Saldo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {receivables.map((receivable) => (
                <tr key={receivable.id}>
                  <td className="materia-reference">
                    <Link className="materia-title-link" href={`/sistema/financeiro/contas-a-receber/${receivable.id}`}>
                      {receivable.reference}
                    </Link>
                  </td>
                  <td>{formatDate(receivable.competencyDate)}</td>
                  <td>{formatDate(receivable.dueDate)}</td>
                  <td>{formatAmount(receivable.originalAmount)}</td>
                  <td>{formatAmount(receivable.balance)}</td>
                  <td>
                    <span className={statusPillClass(receivable.status)}>{RECEIVABLE_STATUS_LABELS[receivable.status]}</span>
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
