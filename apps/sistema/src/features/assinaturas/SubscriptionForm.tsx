"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Subscription } from "@ir/types";
import {
  SUBSCRIPTION_PERIODICITIES,
  SUBSCRIPTION_PERIODICITY_LABELS,
  SUBSCRIPTION_SERVICE_TYPES,
  SUBSCRIPTION_SERVICE_TYPE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TRANSITIONS,
  computeNextDueDate,
} from "@ir/types";
import { createSubscription, updateSubscription } from "../../app/sistema/assinaturas/actions";
import { ClientPicker } from "../../components/admin/ClientPicker";
import type { ClientSearchResult } from "../../components/admin/clientSearchTypes";
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
  /** Cadastro já resolvido no servidor — da própria assinatura (edição) ou de ?clientId= (nova, vindo da tela de um cliente). */
  initialSelectedClient?: ClientSearchResult | null;
}

/**
 * Estrutura operacional do módulo Assinaturas (Parte 2B) — container amplo/
 * centralizado e grid de 12 colunas (`.cadastro-form`/`.cadastro-grid`/
 * `.cadastro-field--span-*`), mesmo padrão já aprovado em Cadastros
 * (ClientForm): evita a largura estreita/vazios do antigo `.form-grid`
 * (fixo em 2 colunas, sempre, mesmo em telas largas). Campos de Impresso/TV
 * aparecem só quando o serviço correspondente está selecionado. Cancelada
 * é estado final — o seletor de status trava nesse valor quando a
 * assinatura já está cancelada (ver SUBSCRIPTION_STATUS_TRANSITIONS).
 */
export function SubscriptionForm({ mode, subscription, initialSelectedClient }: SubscriptionFormProps): JSX.Element {
  const router = useRouter();
  const [payload, setPayload] = useState<SubscriptionFormPayload>(() =>
    payloadFromSubscription(subscription, initialSelectedClient?.id),
  );
  const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(initialSelectedClient ?? null);
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
    <div className="cadastro-form">
      <section className="form-section form-section--first">
        <h2>Cliente e serviço</h2>
        <div className="cadastro-grid">
          <div className="cadastro-field cadastro-field--span-8">
            <ClientPicker
              selected={selectedClient}
              onSelect={(client) => {
                setSelectedClient(client);
                set("clientId", client?.id ?? "");
              }}
              disabled={mode === "edit"}
              helperText={mode === "edit" ? "O cadastro não pode ser trocado depois que a assinatura é criada." : undefined}
            />
          </div>
          <label className="cadastro-field cadastro-field--span-4">
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
        <div className="cadastro-grid">
          <label className="cadastro-field cadastro-field--span-4">
            <span className="field-label">Valor (R$)</span>
            <input
              type="text"
              inputMode="decimal"
              value={payload.amount}
              onChange={(event) => set("amount", event.target.value)}
              placeholder="0,00"
            />
          </label>
          <label className="cadastro-field cadastro-field--span-4">
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
        <div className="cadastro-grid">
          <label className="cadastro-field cadastro-field--span-3">
            <span className="field-label">Data de início</span>
            <input type="date" value={payload.startsAt} onChange={(event) => set("startsAt", event.target.value)} />
          </label>
          <label className="cadastro-field cadastro-field--span-3">
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
          <label className="cadastro-field cadastro-field--span-3">
            <span className="field-label">Próximo vencimento <span className="field-optional">(opcional)</span></span>
            <div className="cadastro-field-with-clear">
              <input
                type="date"
                value={payload.nextDueDate}
                onChange={(event) => {
                  nextDueDateTouched.current = true;
                  set("nextDueDate", event.target.value);
                }}
              />
              {payload.nextDueDate ? (
                <button
                  type="button"
                  className="cadastro-field-clear"
                  aria-label="Limpar próximo vencimento"
                  onClick={() => {
                    nextDueDateTouched.current = true;
                    set("nextDueDate", "");
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>
            <span className="helper-text">Sugerido a partir do início + dia de vencimento — ajustável livremente.</span>
          </label>
          <label className="cadastro-field cadastro-field--span-3">
            <span className="field-label">Data de encerramento <span className="field-optional">(opcional)</span></span>
            <div className="cadastro-field-with-clear">
              <input type="date" value={payload.endsAt} onChange={(event) => set("endsAt", event.target.value)} />
              {payload.endsAt ? (
                <button
                  type="button"
                  className="cadastro-field-clear"
                  aria-label="Limpar data de encerramento"
                  onClick={() => set("endsAt", "")}
                >
                  ×
                </button>
              ) : null}
            </div>
            <span className="helper-text">Término programado — diferente de cancelar. Não encerra nada automaticamente.</span>
          </label>
        </div>
      </section>

      {isImpresso ? (
        <section className="form-section">
          <h2>Entrega do impresso</h2>
          <p className="helper-text">O endereço de entrega pode ser diferente do endereço principal do cliente.</p>
          <div className="cadastro-grid">
            <label className="cadastro-field cadastro-field--span-3">
              <span className="field-label">Quantidade de exemplares</span>
              <input type="number" min={1} value={payload.printCopies} onChange={(event) => set("printCopies", event.target.value)} />
            </label>
            <label className="cadastro-field cadastro-field--span-2">
              <span className="field-label">CEP <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.printAddressZip} onChange={(event) => set("printAddressZip", event.target.value)} />
            </label>
            <label className="cadastro-field cadastro-field--span-7">
              <span className="field-label">Logradouro <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.printAddressStreet} onChange={(event) => set("printAddressStreet", event.target.value)} />
            </label>
            <label className="cadastro-field cadastro-field--span-2">
              <span className="field-label">Número <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.printAddressNumber} onChange={(event) => set("printAddressNumber", event.target.value)} />
            </label>
            <label className="cadastro-field cadastro-field--span-3">
              <span className="field-label">Complemento <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.printAddressComplement} onChange={(event) => set("printAddressComplement", event.target.value)} />
            </label>
            <label className="cadastro-field cadastro-field--span-3">
              <span className="field-label">Bairro <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.printAddressNeighborhood} onChange={(event) => set("printAddressNeighborhood", event.target.value)} />
            </label>
            <label className="cadastro-field cadastro-field--span-4">
              <span className="field-label">Cidade <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.printAddressCity} onChange={(event) => set("printAddressCity", event.target.value)} />
            </label>
            <label className="cadastro-field cadastro-field--span-2">
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
          <div className="cadastro-grid">
            <label className="cadastro-field cadastro-field--span-4">
              <span className="field-label">Origem externa <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.externalSource} onChange={(event) => set("externalSource", event.target.value)} placeholder="ex.: altnix-informativo" />
            </label>
            <label className="cadastro-field cadastro-field--span-4">
              <span className="field-label">Referência do cliente externo <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.externalClientReference} onChange={(event) => set("externalClientReference", event.target.value)} />
            </label>
            <label className="cadastro-field cadastro-field--span-4">
              <span className="field-label">Referência do dispositivo <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.externalDeviceReference} onChange={(event) => set("externalDeviceReference", event.target.value)} />
            </label>
          </div>
        </section>
      ) : null}

      <section className="form-section">
        <h2>Situação</h2>
        <div className="cadastro-grid">
          <label className="cadastro-field cadastro-field--span-4">
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
        <div className="cadastro-grid">
          <label className="cadastro-field cadastro-field--span-12">
            <span className="field-label">Observações <span className="field-optional">(opcional)</span></span>
            <textarea rows={4} value={payload.notes} onChange={(event) => set("notes", event.target.value)} />
          </label>
        </div>
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
