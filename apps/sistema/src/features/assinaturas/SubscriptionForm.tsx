"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Client, Subscription } from "@ir/types";
import {
  SUBSCRIPTION_PERIODICITIES,
  SUBSCRIPTION_PERIODICITY_LABELS,
  SUBSCRIPTION_SERVICE_TYPES,
  SUBSCRIPTION_SERVICE_TYPE_LABELS,
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_LABELS,
  clientDisplayName,
} from "@ir/types";
import { createSubscription, updateSubscription } from "../../app/sistema/assinaturas/actions";
import type { SubscriptionFormPayload } from "./subscriptionFormTypes";

function payloadFromSubscription(subscription?: Subscription, initialClientId?: string): SubscriptionFormPayload {
  return {
    clientId: subscription?.clientId ?? initialClientId ?? "",
    serviceType: subscription?.serviceType ?? "impresso",
    status: subscription?.status ?? "active",
    amount: subscription ? String(subscription.amount) : "",
    periodicity: subscription?.periodicity ?? "monthly",
    startsAt: subscription?.startsAt ?? new Date().toISOString().slice(0, 10),
    dueDate: subscription?.dueDate ?? "",
    notes: subscription?.notes ?? "",
  };
}

interface SubscriptionFormProps {
  mode: "create" | "edit";
  subscription?: Subscription;
  clients: Client[];
  /** Pré-seleciona o cliente ao chegar vindo da tela de um cliente específico (ex.: ?clientId=). */
  initialClientId?: string;
}

/**
 * Estrutura inicial do módulo Assinaturas — mesma convenção visual do
 * resto do painel (.form-section/.form-grid/.form-field, mesmos botões e
 * espaçamentos do ClientForm/ArticleForm). Sem campos de cobrança/baixa de
 * pagamento ainda — só o vínculo com o cliente e os dados básicos do
 * serviço.
 */
export function SubscriptionForm({ mode, subscription, clients, initialClientId }: SubscriptionFormProps): JSX.Element {
  const router = useRouter();
  const [payload, setPayload] = useState<SubscriptionFormPayload>(() =>
    payloadFromSubscription(subscription, initialClientId),
  );
  const [clientFilter, setClientFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof SubscriptionFormPayload>(key: K, value: SubscriptionFormPayload[K]): void {
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
      const result =
        mode === "create" ? await createSubscription(payload) : await updateSubscription(subscription!.id, payload);
      if (result && "error" in result) setError(result.error);
    });
  }

  return (
    <div className="inline-form">
      <section className="form-section form-section--first">
        <h2>Cliente</h2>
        <div className="form-grid">
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Buscar cliente</span>
            <input
              type="search"
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
              placeholder="Nome, razão social ou referência"
              disabled={mode === "edit"}
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Cliente</span>
            <select
              value={payload.clientId}
              onChange={(event) => set("clientId", event.target.value)}
              disabled={mode === "edit"}
            >
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
        </div>
      </section>

      <section className="form-section">
        <h2>Serviço</h2>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Tipo de serviço</span>
            <select value={payload.serviceType} onChange={(event) => set("serviceType", event.target.value as SubscriptionFormPayload["serviceType"])}>
              {SUBSCRIPTION_SERVICE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {SUBSCRIPTION_SERVICE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="field-label">Status</span>
            <select value={payload.status} onChange={(event) => set("status", event.target.value as SubscriptionFormPayload["status"])}>
              {SUBSCRIPTION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {SUBSCRIPTION_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="field-label">Periodicidade</span>
            <select value={payload.periodicity} onChange={(event) => set("periodicity", event.target.value as SubscriptionFormPayload["periodicity"])}>
              {SUBSCRIPTION_PERIODICITIES.map((periodicity) => (
                <option key={periodicity} value={periodicity}>
                  {SUBSCRIPTION_PERIODICITY_LABELS[periodicity]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="field-label">Valor (R$)</span>
            <input
              type="text"
              inputMode="decimal"
              value={payload.amount}
              onChange={(event) => set("amount", event.target.value)}
              placeholder="0,00"
            />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Datas</h2>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Data de início</span>
            <input type="date" value={payload.startsAt} onChange={(event) => set("startsAt", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Vencimento <span className="field-optional">(opcional)</span></span>
            <input type="date" value={payload.dueDate} onChange={(event) => set("dueDate", event.target.value)} />
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

      <div className="form-actions">
        <button type="button" className="form-action-primary" onClick={handleSubmit} disabled={pending}>
          {pending ? "Salvando…" : mode === "create" ? "Criar assinatura" : "Salvar alterações"}
        </button>
        <button type="button" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
