"use client";

import { useRef, useState, type JSX } from "react";

type Props = {
  token: string;
  total: number;
  current: "pix" | "credit_card";
  card: { enabled: boolean; maxInstallments: number; minInstallmentAmount: number };
};

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Escolha da forma de pagamento em janela modal (elemento <dialog> nativo: foco preso, Esc fecha, leitores de tela).
 * Cartão abre a fatura segura do Asaas NA MESMA ABA (sem pop-up, sem nova aba, sem iframe); o Pix reabre a
 * página da nova cobrança. O retorno do cartão nunca prova pagamento: a página consulta o estado oficial.
 */
export function PublicPaymentMethodPicker({ token, total, current, card }: Props): JSX.Element | null {
  const dialog = useRef<HTMLDialogElement>(null);
  const [method, setMethod] = useState<"pix" | "card">(current === "credit_card" ? "pix" : card.enabled ? "card" : "pix");
  const [installments, setInstallments] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!card.enabled) return null;

  const options = Array.from({ length: Math.max(1, card.maxInstallments) }, (_, i) => i + 1)
    .filter((n) => n === 1 || Math.round((total / n) * 100) >= Math.round(card.minInstallmentAmount * 100));

  async function confirm() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/public/pagamento/${encodeURIComponent(token)}/metodo`, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify(method === "card" ? { method, installments } : { method }),
      });
      const body = await response.json().catch(() => null);
      const target: string | undefined = method === "card" ? body?.charge?.checkoutUrl : body?.charge?.paymentUrl;
      if ((response.ok || response.status === 202) && typeof target === "string" && target.startsWith("https://")) {
        window.location.assign(target);
        return;
      }
      if (response.status === 202 || body?.charge?.state === "confirming") { window.location.reload(); return; }
      setError(typeof body?.error === "string" ? body.error : "Não foi possível continuar. Tente novamente em instantes.");
    } catch { setError("Não foi possível continuar. Tente novamente em instantes."); }
    setBusy(false);
  }

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()}
        style={{ width: "100%", marginTop: 14, minHeight: 48, borderRadius: 10, border: "2px solid #17172b", background: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
        {current === "credit_card" ? "Prefiro pagar com PIX" : "Pagar com cartão de crédito"}
      </button>
      <dialog ref={dialog} aria-labelledby="forma-pagamento-titulo" style={{ width: "min(480px, 94vw)", borderRadius: 14, border: "1px solid #ddd9cc", padding: 22 }}>
        <h2 id="forma-pagamento-titulo" style={{ margin: "0 0 12px", fontSize: 22 }}>Escolha como pagar</h2>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 10 }}>
          <legend style={{ fontSize: 14, color: "#555", marginBottom: 6 }}>Forma de pagamento</legend>
          <label style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 48, fontSize: 17 }}>
            <input type="radio" name="forma" checked={method === "pix"} onChange={() => setMethod("pix")} style={{ width: 22, height: 22 }} />Pagar com PIX
          </label>
          <label style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 48, fontSize: 17 }}>
            <input type="radio" name="forma" checked={method === "card"} onChange={() => setMethod("card")} style={{ width: 22, height: 22 }} />Pagar com cartão de crédito
          </label>
        </fieldset>
        {method === "card" ? (
          <div style={{ marginTop: 10 }}>
            <label style={{ display: "block", fontSize: 15, fontWeight: 700, marginBottom: 6 }} htmlFor="parcelas">Parcelas</label>
            <select id="parcelas" value={installments} onChange={(e) => setInstallments(Number(e.target.value))}
              style={{ width: "100%", minHeight: 48, fontSize: 16, borderRadius: 8, padding: "0 10px" }}>
              {options.map((n) => <option key={n} value={n}>{n === 1 ? `À vista — ${money(total)}` : `${n}× de ${money(Math.round((total / n) * 100) / 100)} — total ${money(total)}`}</option>)}
            </select>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.5 }}>
              O valor total é {money(total)} em qualquer opção; nenhum juro ou taxa é acrescentado por nós. Você digitará os dados do cartão
              somente na página segura do Asaas, que abre nesta mesma janela.
            </p>
          </div>
        ) : <p style={{ fontSize: 14, color: "#555" }}>Você verá o QR Code e o código PIX nesta página.</p>}
        {error ? <p role="alert" style={{ color: "#9b1c1c", fontWeight: 700 }}>{error}</p> : null}
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button type="button" onClick={() => dialog.current?.close()} disabled={busy}
            style={{ flex: 1, minHeight: 48, borderRadius: 10, border: "1px solid #bbb", background: "#fff", fontSize: 16 }}>Cancelar</button>
          <button type="button" onClick={confirm} disabled={busy}
            style={{ flex: 2, minHeight: 48, borderRadius: 10, border: 0, background: "#c7232d", color: "#fff", fontSize: 16, fontWeight: 800 }}>
            {busy ? "Aguarde…" : method === "card" ? "Continuar para o cartão" : "Mostrar PIX"}
          </button>
        </div>
      </dialog>
    </>
  );
}
