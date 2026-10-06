"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Client, Subscription } from "@ir/types";
import {
  SUBSCRIPTION_PERIODICITIES,
  SUBSCRIPTION_PERIODICITY_LABELS,
  SUBSCRIPTION_SERVICE_TYPES,
  SUBSCRIPTION_SERVICE_TYPE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TRANSITIONS,
  clientDisplayName,
  computeNextDueDate,
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
    dueDay: subscription?.dueDay ? String(subscription.dueDay) : "",
    nextDueDate: subscription?.nextDueDate ?? "",
    endsAt: subscription?.endsAt ?? "",
    printCopies: subscription?.print?.copies ? String(subscription.print.copies) : "1",
    printAddressZip: subscription?.print?.addressZip ?? "",
    printAddressStreet: subscription?.print?.addressStreet ?? "",
    printAddressNumber: subscription?.print?.addressNumber ?? "",
    printAddressComplement: subscription?.print?.addressComplement ?? "",
    printAddressNeighborhood: subscription?.print?.addressNeighborhood ?? "",
    printAddressCity: subscription?.print?.addressCity ?? "",
    printAddressState: subscription?.print?.addressState ?? "",
    externalSource: subscription?.tv?.externalSource ?? "",
    externalClientReference: subscription?.tv?.externalClientReference ?? "",
    externalDeviceReference: subscription?.tv?.externalDeviceReference ?? "",
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
 * Estrutura operacional do módulo Assinaturas (Parte 2B) — mesma
 * convenção visual do resto do painel (.form-section/.form-grid/
 * .form-field, mesmos botões e espaçamentos do ClientForm/ArticleForm).
 * Campos de Impresso/TV aparecem só quando o serviço correspondente está
 * selecionado. Cancelada é estado final — o seletor de status trava
 * nesse valor quando a assinatura já está cancelada (ver
 * SUBSCRIPTION_STATUS_TRANSITIONS).
 */
export function SubscriptionForm({ mode, subscription, clients, initialClientId }: SubscriptionFormProps): JSX.Element {
  const router = useRouter();
  const [payload, setPayload] = useState<SubscriptionFormPayload>(() =>
    payloadFromSubscription(subscription, initialClientId),
  );
  const [clientFilter, setClientFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Rastreia se o usuário já editou "Próximo vencimento" manualmente —
  // enquanto não editar, a sugestão (início + dia de vencimento) continua
  // recalculando sozinha; depois de editar, nunca mais sobrescreve
  // (requisito: sempre ajustável manualmente).
  const nextDueDateTouched = useRef(mode === "edit");

  function set<K extends keyof SubscriptionFormPayload>(key: K, value: SubscriptionFormPayload[K]): void {
    setPayload((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    if (nextDueDateTouched.current) return;
    const dueDay = Number(payload.dueDay);
    if (!payload.startsAt || !payload.dueDay.trim() || !Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) return;
    setPayload((prev) => ({ ...prev, nextDueDate: computeNextDueDate(prev.startsAt, dueDay) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só recalcula ao digitar início/dia; nextDueDate em si nunca deve re-disparar isto.
  }, [payload.startsAt, payload.dueDay]);

  const filteredClients = useMemo(() => {
    const term = clientFilter.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((client) => {
      const name = clientDisplayName(client).toLowerCase();
      return name.includes(term) || client.reference.toLowerCase().includes(term);
    });
  }, [clients, clientFilter]);

  const selectedClient = clients.find((client) => client.id === payload.clientId);
  const isImpresso = payload.serviceType === "impresso";
  const isTv = payload.serviceType === "tv";
  const isCancelled = subscription?.status === "cancelled";
  const allowedStatuses: SubscriptionFormPayload["status"][] = subscription
    ? [subscription.status, ...SUBSCRIPTION_STATUS_TRANSITIONS[subscription.status]]
    : ["active"];

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
        <h2>Cliente e serviço</h2>
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
        </div>
      </section>

      <section className="form-section">
        <h2>Plano e cobrança</h2>
        <div className="form-grid">
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
        </div>
      </section>

      <section className="form-section">
        <h2>Período</h2>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Data de início</span>
            <input type="date" value={payload.startsAt} onChange={(event) => set("startsAt", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Dia de vencimento <span className="field-optional">(opcional, 1-31)</span></span>
            <input
              type="number"
              min={1}
              max={31}
              value={payload.dueDay}
              onChange={(event) => set("dueDay", event.target.value)}
              placeholder="ex.: 10"
            />
          </label>
          <label className="form-field">
            <span className="field-label">Próximo vencimento <span className="field-optional">(opcional)</span></span>
            <input
              type="date"
              value={payload.nextDueDate}
              onChange={(event) => {
                nextDueDateTouched.current = true;
                set("nextDueDate", event.target.value);
              }}
            />
            <span className="helper-text">Sugerido a partir do início + dia de vencimento — ajustável livremente.</span>
          </label>
          <label className="form-field">
            <span className="field-label">Data de encerramento <span className="field-optional">(opcional)</span></span>
            <input type="date" value={payload.endsAt} onChange={(event) => set("endsAt", event.target.value)} />
            <span className="helper-text">Término programado — diferente de cancelar. Não encerra nada automaticamente.</span>
          </label>
        </div>
      </section>

      {isImpresso ? (
        <section className="form-section">
          <h2>Entrega do impresso</h2>
          <p className="helper-text">O endereço de entrega pode ser diferente do endereço principal do cliente.</p>
          <div className="form-grid">
            <label className="form-field">
              <span className="field-label">Quantidade de exemplares</span>
              <input type="number" min={1} value={payload.printCopies} onChange={(event) => set("printCopies", event.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">CEP <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.printAddressZip} onChange={(event) => set("printAddressZip", event.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">Logradouro <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.printAddressStreet} onChange={(event) => set("printAddressStreet", event.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">Número <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.printAddressNumber} onChange={(event) => set("printAddressNumber", event.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">Complemento <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.printAddressComplement} onChange={(event) => set("printAddressComplement", event.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">Bairro <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.printAddressNeighborhood} onChange={(event) => set("printAddressNeighborhood", event.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">Cidade <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.printAddressCity} onChange={(event) => set("printAddressCity", event.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">UF <span className="field-optional">(opcional)</span></span>
              <input type="text" maxLength={2} value={payload.printAddressState} onChange={(event) => set("printAddressState", event.target.value.toUpperCase())} />
            </label>
          </div>
        </section>
      ) : null}

      {isTv ? (
        <section className="form-section">
          <h2>Integração TV <span className="field-optional">(preparação futura)</span></h2>
          <p className="helper-text">
            Sem integração real com o Altnix Informativo nesta fase — só referências genéricas e opcionais pra um vínculo futuro.
          </p>
          <div className="form-grid">
            <label className="form-field">
              <span className="field-label">Origem externa <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.externalSource} onChange={(event) => set("externalSource", event.target.value)} placeholder="ex.: altnix-informativo" />
            </label>
            <label className="form-field">
              <span className="field-label">Referência do cliente externo <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.externalClientReference} onChange={(event) => set("externalClientReference", event.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">Referência do dispositivo <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.externalDeviceReference} onChange={(event) => set("externalDeviceReference", event.target.value)} />
            </label>
          </div>
        </section>
      ) : null}

      <section className="form-section">
        <h2>Situação</h2>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Status</span>
            <select
              value={payload.status}
              onChange={(event) => set("status", event.target.value as SubscriptionFormPayload["status"])}
              disabled={isCancelled}
            >
              {allowedStatuses.map((status) => (
                <option key={status} value={status}>
                  {SUBSCRIPTION_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            {isCancelled ? (
              <span className="helper-text">Cancelada é definitiva — crie uma nova assinatura para retomar o serviço.</span>
            ) : null}
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
