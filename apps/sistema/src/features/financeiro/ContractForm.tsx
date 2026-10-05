"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Client, InstitutionalContract } from "@ir/types";
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUSES, clientDisplayName } from "@ir/types";
import { createContract, updateContract } from "../../app/sistema/financeiro/contratos/actions";
import type { ContractFormPayload } from "./contractFormTypes";

function payloadFromContract(contract?: InstitutionalContract, initialClientId?: string): ContractFormPayload {
  return {
    clientId: contract?.clientId ?? initialClientId ?? "",
    contractNumber: contract?.contractNumber ?? "",
    processNumber: contract?.processNumber ?? "",
    modality: contract?.modality ?? "",
    biddingReference: contract?.biddingReference ?? "",
    object: contract?.object ?? "",
    contractedAmount: contract?.contractedAmount !== undefined ? String(contract.contractedAmount) : "",
    startsAt: contract?.startsAt ?? "",
    endsAt: contract?.endsAt ?? "",
    status: contract?.status ?? "active",
    notes: contract?.notes ?? "",
  };
}

interface ContractFormProps {
  mode: "create" | "edit";
  contract?: InstitutionalContract;
  clients: Client[];
  initialClientId?: string;
  /** Modo controlado (usado pelo Passo 3 do wizard "documento primeiro") — quando presentes, value/onChange substituem o estado interno e os botões de ação ficam ocultos (hideActions). */
  value?: ContractFormPayload;
  onChange?: (payload: ContractFormPayload) => void;
  hideActions?: boolean;
}

/**
 * Formulário do contrato institucional (Parte 3A, item 10) — poucos
 * campos obrigatórios de propósito: cada órgão (prefeitura, câmara,
 * SAMAE, CASAN etc.) preenche o que tem. Dados extraídos de um documento
 * (quando existir) chegam aqui já conferidos pelo usuário — nunca são
 * aplicados automaticamente antes de passar por este formulário. No modo
 * controlado (value/onChange), este componente é só os campos — o
 * wizard de novo contrato controla quando/como salvar.
 */
export function ContractForm({ mode, contract, clients, initialClientId, value, onChange, hideActions }: ContractFormProps): JSX.Element {
  const router = useRouter();
  const [internalPayload, setInternalPayload] = useState<ContractFormPayload>(() => payloadFromContract(contract, initialClientId));
  const payload = value ?? internalPayload;
  const [clientFilter, setClientFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof ContractFormPayload>(key: K, fieldValue: ContractFormPayload[K]): void {
    const next = { ...payload, [key]: fieldValue };
    if (onChange) onChange(next);
    else setInternalPayload(next);
  }

  const filteredClients = useMemo(() => {
    const term = clientFilter.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((client) => {
      const name = clientDisplayName(client).toLowerCase();
      return name.includes(term) || client.reference.toLowerCase().includes(term);
    });
  }, [clients, clientFilter]);

  function handleSubmit(): void {
    setError(null);
    startTransition(async () => {
      const result = mode === "create" ? await createContract(payload) : await updateContract(contract!.id, payload);
      if (result && "error" in result) setError(result.error);
    });
  }

  return (
    <div className="inline-form">
      <section className="form-section form-section--first">
        <h2>Cliente/órgão</h2>
        <div className="form-grid">
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Buscar cliente/órgão</span>
            <input type="search" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} placeholder="Nome, razão social ou referência" />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Cliente/órgão</span>
            <select value={payload.clientId} onChange={(event) => set("clientId", event.target.value)}>
              <option value="">Selecione…</option>
              {filteredClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {clientDisplayName(client)} ({client.reference})
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Identificação do contrato <span className="field-optional">(campos opcionais — cada órgão trabalha de forma diferente)</span></h2>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Número do contrato</span>
            <input type="text" value={payload.contractNumber} onChange={(event) => set("contractNumber", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Número do processo</span>
            <input type="text" value={payload.processNumber} onChange={(event) => set("processNumber", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Modalidade</span>
            <input type="text" value={payload.modality} onChange={(event) => set("modality", event.target.value)} placeholder="ex.: Pregão, dispensa, inexigibilidade" />
          </label>
          <label className="form-field">
            <span className="field-label">Referência da licitação</span>
            <input type="text" value={payload.biddingReference} onChange={(event) => set("biddingReference", event.target.value)} />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Objeto do contrato</span>
            <textarea rows={2} value={payload.object} onChange={(event) => set("object", event.target.value)} />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Valor e vigência</h2>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Valor total contratado <span className="field-optional">(opcional)</span></span>
            <input type="text" inputMode="decimal" value={payload.contractedAmount} onChange={(event) => set("contractedAmount", event.target.value)} placeholder="0,00" />
          </label>
          <label className="form-field">
            <span className="field-label">Início da vigência <span className="field-optional">(opcional)</span></span>
            <input type="date" value={payload.startsAt} onChange={(event) => set("startsAt", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Fim da vigência <span className="field-optional">(opcional)</span></span>
            <input type="date" value={payload.endsAt} onChange={(event) => set("endsAt", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Status</span>
            <select value={payload.status} onChange={(event) => set("status", event.target.value as ContractFormPayload["status"])}>
              {CONTRACT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {CONTRACT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Observações</h2>
        <label className="form-field">
          <span className="field-label">Observações <span className="field-optional">(opcional)</span></span>
          <textarea rows={4} value={payload.notes} onChange={(event) => set("notes", event.target.value)} />
        </label>
      </section>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {!hideActions ? (
        <div className="form-actions">
          <button type="button" className="form-action-primary" onClick={handleSubmit} disabled={pending}>
            {pending ? "Salvando…" : mode === "create" ? "Criar contrato" : "Salvar alterações"}
          </button>
          <button type="button" onClick={() => router.back()} disabled={pending}>
            Cancelar
          </button>
        </div>
      ) : null}
    </div>
  );
}
