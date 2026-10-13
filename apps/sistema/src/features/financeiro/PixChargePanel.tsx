"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PaymentCharge } from "@ir/types";
import { PAYMENT_CHARGE_STATUS_LABELS } from "@ir/types";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import {
  buildBillingMessagePreviewAction,
  cancelPixChargeAction,
  confirmPixChargeAction,
  createPixChargeAction,
  sendBillingMessageAction,
} from "../../app/sistema/financeiro/contas-a-receber/actions";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

type ActionOutcome =
  | { error: string }
  | { ok: true }
  | { ok: true; status: "sent" | "simulated" }
  | { ok: true; overpaymentAmount: number }
  | void;

/**
 * Painel de cobrança Pix do título — DELIBERADAMENTE separado de
 * ReceivableActionsPanel (histórico de recebimentos/abatimentos): cobrança
 * PENDENTE é um conceito diferente de pagamento já confirmado (item 22 da
 * tarefa, "não misturar tudo visualmente"). Também concentra "Enviar ao
 * cliente", já que a mensagem de cobrança normalmente inclui o Pix.
 */
export function PixChargePanel({
  receivableId,
  clientId,
  receivableBalance,
  charges,
  localPreview,
}: {
  receivableId: string;
  clientId: string;
  receivableBalance: number;
  charges: PaymentCharge[];
  localPreview: boolean;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState(String(receivableBalance.toFixed(2)).replace(".", ","));
  const [description, setDescription] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const [cancelTarget, setCancelTarget] = useState<PaymentCharge | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const [copied, setCopied] = useState(false);

  const [sendOpen, setSendOpen] = useState(false);
  const [sendMessage, setSendMessage] = useState("");
  const [sendHasWhatsapp, setSendHasWhatsapp] = useState(true);
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);
  const [confirmFeedback, setConfirmFeedback] = useState<string | null>(null);

  const pendingCharge = charges.find((c) => c.status === "pending") ?? null;

  function run(action: () => Promise<ActionOutcome>, onSuccess?: () => void): void {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  /** Só visível quando localPreview=true (ver botão) — demonstra a confirmação (inclusive o excedente virando crédito, se houver), sem nenhuma chamada real. */
  function confirmDemo(chargeId: string): void {
    setError(null);
    setConfirmFeedback(null);
    startTransition(async () => {
      const result = await confirmPixChargeAction(chargeId, receivableId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setConfirmFeedback(
        result.overpaymentAmount > 0
          ? `Pagamento confirmado (demonstração). Título quitado; ${formatAmount(result.overpaymentAmount)} do excedente foram registrados como crédito do cliente.`
          : "Pagamento confirmado (demonstração).",
      );
      router.refresh();
    });
  }

  async function openSendPreview(): Promise<void> {
    setError(null);
    setSendFeedback(null);
    const result = await buildBillingMessagePreviewAction(receivableId);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSendMessage(result.message);
    setSendHasWhatsapp(result.hasWhatsapp);
    setSendOpen(true);
  }

  return (
    <section className="form-section">
      <h2>Cobrança Pix</h2>
      {localPreview ? (
        <p className="helper-text">
          <strong>Demonstração (preview local) — nenhuma cobrança Pix real é criada, nenhum provedor é chamado.</strong>
        </p>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {!pendingCharge && !showForm ? (
        <div className="form-actions">
          <button type="button" onClick={() => setShowForm(true)} disabled={pending || receivableBalance <= 0}>
            Gerar cobrança Pix
          </button>
        </div>
      ) : null}

      {showForm ? (
        <div className="form-grid" style={{ marginTop: "14px" }}>
          <p className="helper-text" style={{ gridColumn: "1 / -1" }}>
            Saldo atual: {formatAmount(receivableBalance)}. Por padrão a cobrança é do saldo total — pode gerar um valor menor (cobrança parcial), desde que seja de pelo menos R$ 5,00.
          </p>
          <label className="form-field">
            <span className="field-label">Valor a cobrar (R$)</span>
            <input type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Vencimento/expiração <span className="field-optional">(opcional)</span></span>
            <input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Descrição <span className="field-optional">(opcional)</span></span>
            <input type="text" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
            <button
              type="button"
              className="form-action-primary"
              disabled={pending}
              onClick={() =>
                run(() => createPixChargeAction(receivableId, clientId, { amount, description, expiresAt }), () => setShowForm(false))
              }
            >
              {pending ? "Gerando…" : "Confirmar geração"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} disabled={pending}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {pendingCharge ? (
        <div className="form-grid" style={{ marginTop: "14px" }}>
          <div style={{ gridColumn: "1 / -1" }} className="helper-text">
            <span className="status-pill status-pill--draft">{PAYMENT_CHARGE_STATUS_LABELS[pendingCharge.status]}</span>{" "}
            · {formatAmount(pendingCharge.amount)}
            {pendingCharge.expiresAt ? ` · expira em ${formatDateTime(pendingCharge.expiresAt)}` : ""}
          </div>
          <div
            style={{ gridColumn: "1 / -1", border: "1px dashed var(--line)", borderRadius: "4px", padding: "14px", display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-start" }}
          >
            <div
              style={{
                width: "132px",
                minHeight: "132px",
                flex: "0 0 auto",
                border: "1px solid var(--line)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#fff",
                padding: "6px",
              }}
            >
              {pendingCharge.publicToken ? (
                <img
                  src={`/api/public/pagamento/${pendingCharge.publicToken}/qrcode`}
                  alt="QR Code Pix"
                  width={120}
                  height={120}
                  style={{ width: "120px", height: "120px", objectFit: "contain" }}
                />
              ) : (
                <span className="helper-text">QR Code indisponível.</span>
              )}
            </div>
            <div style={{ flex: "1 1 220px", minWidth: "220px" }}>
              <p className="helper-text" style={{ fontWeight: 700, marginBottom: "4px" }}>
                Pix Copia e Cola
              </p>
              <p className="helper-text" style={{ wordBreak: "break-all" }}>
                {pendingCharge.pixCopyPaste || "Payload Pix ainda não disponível."}
              </p>
            </div>
          </div>
          <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(pendingCharge.pixCopyPaste ?? "").then(
                  () => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1800);
                  },
                  () => setError("Não foi possível copiar."),
                );
              }}
            >
              {copied ? "Copiado ✓" : "Copiar Pix"}
            </button>
            {pendingCharge.publicToken ? (
              <a
                className="button-link"
                href={`/pagamento/${pendingCharge.publicToken}`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir página de pagamento
              </a>
            ) : null}
            <button type="button" onClick={openSendPreview} disabled={pending}>
              Enviar ao cliente
            </button>
            {localPreview ? (
              <button type="button" onClick={() => confirmDemo(pendingCharge.id)} disabled={pending}>
                Confirmar pagamento (demonstração)
              </button>
            ) : null}
            <button type="button" className="media-remove-button" onClick={() => setCancelTarget(pendingCharge)} disabled={pending}>
              Cancelar cobrança
            </button>
          </div>
          {confirmFeedback ? <p className="helper-text">{confirmFeedback}</p> : null}
        </div>
      ) : null}

      {charges.length > 0 ? (
        <div className="materias-table-wrap" style={{ marginTop: "14px" }}>
          <table className="materias-table">
            <thead>
              <tr>
                <th>Criada em</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Expira</th>
                <th>Paga em</th>
              </tr>
            </thead>
            <tbody>
              {charges.map((charge) => (
                <tr key={charge.id}>
                  <td>{formatDateTime(charge.createdAt)}</td>
                  <td>{formatAmount(charge.amount)}</td>
                  <td>{PAYMENT_CHARGE_STATUS_LABELS[charge.status]}</td>
                  <td>{formatDateTime(charge.expiresAt)}</td>
                  <td>{formatDateTime(charge.paidAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="helper-text">Nenhuma cobrança Pix gerada para este título ainda.</p>
      )}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancelar cobrança Pix?"
        description={
          <>
            <p>A cobrança deixa de valer — o saldo do título não é alterado.</p>
            <label className="form-field" style={{ marginTop: "8px" }}>
              <span className="field-label">Motivo <span className="field-optional">(opcional)</span></span>
              <textarea rows={2} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
            </label>
          </>
        }
        confirmLabel={pending ? "Cancelando…" : "Confirmar cancelamento"}
        onConfirm={() =>
          run(
            () => cancelPixChargeAction(cancelTarget!.id, receivableId, cancelReason),
            () => {
              setCancelTarget(null);
              setCancelReason("");
            },
          )
        }
        onCancel={() => {
          setCancelTarget(null);
          setCancelReason("");
        }}
      />

      <ConfirmDialog
        open={sendOpen}
        destructive={false}
        title="Enviar cobrança ao cliente"
        description={
          !sendHasWhatsapp ? (
            <p>
              <strong>Cadastro sem WhatsApp.</strong> Cadastre o WhatsApp do cliente antes de enviar.
            </p>
          ) : (
            <>
              <p className="helper-text">Prévia da mensagem{localPreview ? " (envio será só demonstrativo)" : ""}:</p>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px", background: "#f7f8f3", border: "1px solid var(--line)", borderRadius: "4px", padding: "10px" }}>
                {sendMessage}
              </pre>
              {sendFeedback ? <p className="helper-text">{sendFeedback}</p> : null}
            </>
          )
        }
        confirmLabel={!sendHasWhatsapp ? "Cadastro sem WhatsApp" : pending ? "Enviando…" : localPreview ? "Simular envio" : "Enviar"}
        onConfirm={() => {
          if (!sendHasWhatsapp) return;
          run(
            () => sendBillingMessageAction(receivableId, clientId, sendMessage),
            () => setSendFeedback(localPreview ? "Envio demonstrativo registrado." : "Mensagem enviada."),
          );
        }}
        onCancel={() => {
          setSendOpen(false);
          setSendFeedback(null);
        }}
      />
    </section>
  );
}
