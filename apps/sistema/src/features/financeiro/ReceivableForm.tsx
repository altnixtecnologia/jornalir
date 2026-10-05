"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Client, InstitutionalContract, Receivable } from "@ir/types";
import { RECEIVABLE_SOURCE_TYPES, RECEIVABLE_SOURCE_TYPE_LABELS, clientDisplayName } from "@ir/types";
import { createReceivable, updateReceivable } from "../../app/sistema/financeiro/contas-a-receber/actions";
import type { ReceivableFormPayload } from "./receivableFormTypes";

function payloadFromReceivable(receivable?: Receivable, initialClientId?: string, initialContractId?: string): ReceivableFormPayload {
  return {
    clientId: receivable?.clientId ?? initialClientId ?? "",
    description: receivable?.description ?? "",
    sourceType: receivable?.sourceType ?? (initialContractId ? "institutional_contract" : "miscellaneous"),
    sourceId: receivable?.sourceId ?? "",
    sourceReference: receivable?.sourceReference ?? "",
    subscriptionId: receivable?.subscriptionId ?? "",
    contractId: receivable?.contractId ?? initialContractId ?? "",
    originalAmount: receivable ? String(receivable.originalAmount) : "",
    issueDate: receivable?.issueDate ?? new Date().toISOString().slice(0, 10),
    dueDate: receivable?.dueDate ?? "",
    competencyDate: receivable?.competencyDate ?? "",
    notes: receivable?.notes ?? "",
  };
}

interface ReceivableFormProps {
  mode: "create" | "edit";
  receivable?: Receivable;
  clients: Client[];
  contracts: InstitutionalContract[];
  initialClientId?: string;
  initialContractId?: string;
}

/**
 * Cadastro do título (Parte 3A, item 22) — organizado em blocos
 * compactos (Cliente e origem / Dados do lançamento / Valores /
 * Vencimento / Contrato relacionado / Observações), mesma convenção
 * visual do resto do painel. O campo "Contrato relacionado" só faz
 * sentido pra origem institucional, mas fica sempre disponível (um
 * título avulso também pode, em tese, referenciar um contrato) — sem
 * obrigar a origem para simplificar.
 */
export function ReceivableForm({ mode, receivable, clients, contracts, initialClientId, initialContractId }: ReceivableFormProps): JSX.Element {
  const router = useRouter();
  const [payload, setPayload] = useState<ReceivableFormPayload>(() => payloadFromReceivable(receivable, initialClientId, initialContractId));
  const [clientFilter, setClientFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof ReceivableFormPayload>(key: K, value: ReceivableFormPayload[K]): void {
    setPayload((prev) => ({ ...prev, [key]: value }));
  }

  const filteredClients = useMemo(() => {
    const term = clientFilter.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((client) => {
      const name = clientDisplayName(client).toLowerCase();
      return name.includes(term) || client.reference.toLowerCase().includes(term);
    });
  }, [clients, clientFilter]);

  const selectedClient = clients.find((client) => client.id === payload.clientId);

  function handleSubmit(): void {
    setError(null);
    startTransition(async () => {
      const result = mode === "create" ? await createReceivable(payload) : await updateReceivable(receivable!.id, payload);
      if (result && "error" in result) setError(result.error);
    });
  }

  return (
    <div className="inline-form">
      <section className="form-section form-section--first">
        <h2>Cliente e origem</h2>
        <div className="form-grid">
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Buscar cliente/pagador</span>
            <input
              type="search"
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
              placeholder="Nome, razão social ou referência"
              disabled={mode === "edit"}
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Cliente/pagador</span>
            <select value={payload.clientId} onChange={(event) => set("clientId", event.target.value)} disabled={mode === "edit"}>
              <option value="">Selecione…</option>
              {filteredClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {clientDisplayName(client)} ({client.reference})
                </option>
              ))}
            </select>
          </label>
          {selectedClient ? (
            <p className="helper-text" style={{ gridColumn: "1 / -1" }}>
              {clientDisplayName(selectedClient)} · {selectedClient.reference}
            </p>
          ) : null}
          <label className="form-field">
            <span className="field-label">Origem</span>
            <select value={payload.sourceType} onChange={(event) => set("sourceType", event.target.value as ReceivableFormPayload["sourceType"])}>
              {RECEIVABLE_SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {RECEIVABLE_SOURCE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Dados do lançamento</h2>
        <div className="form-grid">
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Descrição</span>
            <input type="text" value={payload.description} onChange={(event) => set("description", event.target.value)} placeholder="ex.: Assinatura anual — impresso" />
          </label>
          <label className="form-field">
            <span className="field-label">Referência de origem <span className="field-optional">(opcional)</span></span>
            <input
              type="text"
              value={payload.sourceReference}
              onChange={(event) => set("sourceReference", event.target.value)}
              placeholder="ex.: Assinatura IR-ASS-2026-000012"
            />
          </label>
          <label className="form-field">
            <span className="field-label">Id de origem <span className="field-optional">(opcional, avançado)</span></span>
            <input type="text" value={payload.sourceId} onChange={(event) => set("sourceId", event.target.value)} placeholder="ex.: id da assinatura" />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Valores</h2>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Valor original (R$)</span>
            <input type="text" inputMode="decimal" value={payload.originalAmount} onChange={(event) => set("originalAmount", event.target.value)} placeholder="0,00" />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Vencimento</h2>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Data de emissão</span>
            <input type="date" value={payload.issueDate} onChange={(event) => set("issueDate", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Vencimento</span>
            <input type="date" value={payload.dueDate} onChange={(event) => set("dueDate", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Competência <span className="field-optional">(opcional)</span></span>
            <input type="date" value={payload.competencyDate} onChange={(event) => set("competencyDate", event.target.value)} />
          </label>
        </div>
      </section>

      {contracts.length > 0 ? (
        <section className="form-section">
          <h2>Contrato relacionado <span className="field-optional">(opcional)</span></h2>
          <div className="form-grid">
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Contrato institucional</span>
              <select value={payload.contractId} onChange={(event) => set("contractId", event.target.value)}>
                <option value="">Nenhum</option>
                {contracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.reference}{contract.object ? ` — ${contract.object}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      ) : null}

      <section className="form-section">
        <h2>Observações</h2>
        <label className="form-field">
          <span className="field-label">Observações <span className="field-optional">(opcional)</span></span>
          <textarea rows={4} value={payload.notes} onChange={(event) => set("notes", event.target.value)} />
        </label>
      </section>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="form-actions">
        <button type="button" className="form-action-primary" onClick={handleSubmit} disabled={pending}>
          {pending ? "Salvando…" : mode === "create" ? "Criar título" : "Salvar alterações"}
        </button>
        <button type="button" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
