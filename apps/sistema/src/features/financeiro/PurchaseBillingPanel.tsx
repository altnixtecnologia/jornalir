"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { restructureReceivablesAction, prepareSaleAllocationsAction } from "../../app/sistema/financeiro/contas-a-receber/restructure-actions";
import {
  configureAltnixServiceToleranceModeAction, readAltnixServiceTolerancePolicyAction, readAltnixServiceAuthorizationAction,
  type ServiceTolerancePolicy,
} from "../../app/sistema/publicidade/vendas/[id]/operational-authorization-actions";
import type { RestructurePreview } from "../../lib/financeiro/receivableRestructuring";
import type { RestructurableReceivable, SaleComposition } from "../../providers/supabase/saleBillingComposition.supabase";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBr = (iso: string) => iso.split("-").reverse().join("/");
const STATE_LABEL: Record<string, string> = { paid: "Pago", current: "Em dia", overdue: "Em atraso", unproven: "Composição não comprovada", no_charge: "Sem cobrança" };
const TITLE_STATUS: Record<string, string> = { open: "Em aberto", partially_paid: "Pago em parte", paid: "Pago", cancelled: "Cancelado" };
const AUTH_LABEL: Record<string, string> = { authorized: "Liberado", grace: "Em tolerância", suspended: "Suspenso", ended: "Encerrado" };

type Mode = "consolidate" | "split";

export function PurchaseBillingPanel(props: {
  saleId: string; saleReference: string; composition: SaleComposition; candidates: RestructurableReceivable[];
  hasSaleReceivables: boolean; canRestructure: boolean; restructuringEnabled: boolean;
  ledServices: { id: string; title: string }[]; showOperational: boolean;
}) {
  const { composition } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>("consolidate");
  const [splitMode, setSplitMode] = useState<"by_source" | "by_service">("by_source");
  const [picked, setPicked] = useState<string[]>([]);
  const [installments, setInstallments] = useState("1");
  const [firstDue, setFirstDue] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<RestructurePreview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null);

  const command = useMemo(() => ({
    kind: mode, sourceIds: picked, ...(mode === "split" ? { splitMode } : {}),
    installments: Number(installments), firstDueDate: firstDue, description: description.trim(), reason: reason.trim(),
  }), [mode, picked, splitMode, installments, firstDue, description, reason]);

  function open(next: Mode) {
    setMode(next); setPicked([]); setPreview(null); setMessage(""); setConfirmed(false); setDone(false); setOperationId(null);
    dialog.current?.showModal();
  }
  // Qualquer mudança nos dados invalida a prévia e a confirmação.
  useEffect(() => { setPreview(null); setConfirmed(false); }, [command]);

  async function run(previewOnly: boolean) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const op = operationId ?? crypto.randomUUID();
      setOperationId(op);
      const result = await restructureReceivablesAction({ ...command, operationId: op, preview: previewOnly, ...(previewOnly ? {} : { confirmed: true }) });
      if (!result.ok) { setMessage(result.error); return; }
      setPreview(result.preview);
      if (result.applied) { setDone(true); setMessage(result.replayed ? "Operação já havia sido aplicada." : "Cobranças reestruturadas. Os títulos originais foram preservados como histórico."); }
    } catch { setMessage("Não foi possível concluir agora. Nada foi alterado."); } finally { setBusy(false); }
  }

  async function prepare() {
    setBusy(true); setMessage("");
    const result = await prepareSaleAllocationsAction(props.saleId);
    setMessage(result.ok ? `Composição preparada (${result.prepared} cobrança(s)). Atualize a página.` : result.error);
    setBusy(false);
  }

  const canPreview = picked.length >= (mode === "consolidate" ? 2 : 1) && firstDue !== "" && description.trim() !== "" && reason.trim().length >= 10 && Number(installments) >= 1;

  return (
    <section className="form-section" aria-labelledby="purchase-billing-title">
      <h2 id="purchase-billing-title">Composição financeira da compra {props.saleReference}</h2>
      <p className="helper-text">Cada compra gera a sua própria cobrança. Pagamento parcial não é dividido entre serviços: enquanto a cobrança estiver em aberto, todos os serviços nela incluídos permanecem em aberto.</p>
      {!composition.complete && <p role="status">Composição indisponível agora.</p>}
      {composition.complete && composition.receivables.length === 0 && props.hasSaleReceivables && (
        <p>As cobranças desta compra ainda não têm composição por serviço. <button type="button" disabled={busy} onClick={() => void prepare()}>Preparar composição</button></p>
      )}
      {composition.services.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table>
            <caption className="sr-only">Produtos e serviços da compra</caption>
            <thead><tr><th>Produto/serviço</th><th>Valor original</th><th>Valor pago</th><th>Saldo em aberto</th><th>Próximo vencimento em atraso</th><th>Situação financeira</th></tr></thead>
            <tbody>{composition.services.map((s) => (
              <tr key={s.serviceId}><td>{s.title}</td><td>{money(s.valueCents)}</td><td>{money(s.paidCents)}</td><td>{money(s.outstandingCents)}</td><td>{s.oldestDue ? dateBr(s.oldestDue) : "—"}</td><td>{STATE_LABEL[s.financialState]}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {composition.receivables.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table>
            <caption className="sr-only">Cobranças da compra</caption>
            <thead><tr><th>Cobrança</th><th>Vencimento</th><th>Valor</th><th>Situação</th><th>Serviços</th></tr></thead>
            <tbody>{composition.receivables.map((r) => (
              <tr key={r.id}>
                <td>{r.reference}{r.replacement ? " (substituta)" : ""}{r.superseded ? " (substituída)" : ""}</td>
                <td>{dateBr(r.dueDate)}</td><td>{money(r.originalCents)}</td><td>{TITLE_STATUS[r.status]}</td>
                <td>{r.services.map((l) => l.title).join(", ")}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {props.canRestructure && (
        <div className="form-actions">
          <button type="button" onClick={() => open("consolidate")}>Unificar cobranças</button>
          <button type="button" onClick={() => open("split")}>Dividir cobrança</button>
          {!props.restructuringEnabled && <span className="helper-text">A aplicação está desabilitada; é possível apenas simular.</span>}
        </div>
      )}
      {props.showOperational && props.ledServices.length > 0 && <ToleranceControls services={props.ledServices} />}

      <dialog ref={dialog} aria-labelledby="restructure-title" style={{ maxWidth: "min(46rem, 96vw)", width: "100%" }}>
        <form method="dialog" onSubmit={(e) => e.preventDefault()} className="form-grid">
          <h2 id="restructure-title">{mode === "consolidate" ? "Unificar cobranças" : "Dividir cobrança"}</h2>
          <p className="helper-text">Somente cobranças em aberto, sem recebimento nem abatimento e com composição comprovada. As originais são preservadas como histórico e substituídas pelas novas. O cliente não altera nada disto.</p>
          <fieldset>
            <legend>Cobranças</legend>
            {props.candidates.length === 0 && <p>Nenhuma cobrança elegível para este cliente.</p>}
            {props.candidates.map((c) => (
              <label key={c.id} style={{ display: "block" }}>
                <input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked((p) => e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id))} />
                {" "}{c.reference} — {c.purchaseLabel} — {money(c.cents)} — vence {dateBr(c.dueDate)} — {c.services.join(", ")}
              </label>
            ))}
          </fieldset>
          {mode === "split" && (
            <label>Dividir por
              <select value={splitMode} onChange={(e) => setSplitMode(e.target.value as "by_source" | "by_service")}>
                <option value="by_source">Compra de origem</option><option value="by_service">Produto ou serviço</option>
              </select>
            </label>
          )}
          <label>Parcelas por cobrança<input type="number" min={1} max={60} value={installments} onChange={(e) => setInstallments(e.target.value)} /></label>
          <label>Primeiro vencimento<input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} /></label>
          <label>Descrição<input type="text" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <label>Motivo (obrigatório, mínimo 10 caracteres)<textarea maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <div className="form-actions">
            <button type="button" disabled={busy || !canPreview} onClick={() => void run(true)}>Ver como ficará</button>
          </div>
          {preview && (
            <div aria-live="polite">
              <h3>Prévia</h3>
              <p>Total em aberto preservado: {money(preview.totalCents)}</p>
              <ul>{preview.targets.map((t, i) => (
                <li key={i}>{t.description} — vence {dateBr(t.dueDate)} — {money(t.totalCents)} — {t.services.map((s) => `${s.title} (${money(s.cents)})`).join("; ")}</li>
              ))}</ul>
              <p className="helper-text">Serviços afetados: {[...new Set(preview.targets.flatMap((t) => t.services.map((s) => s.title)))].join(", ")}. Cobranças externas (PIX/cartão) ativas serão canceladas somente com comprovação; o cliente poderá gerar o pagamento novamente.</p>
              {props.restructuringEnabled && !done && (
                <>
                  <label><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Confirmo a reestruturação acima</label>
                  <button type="button" disabled={busy || !confirmed} onClick={() => void run(false)}>Aplicar</button>
                </>
              )}
            </div>
          )}
          {message && <p role="status">{message}</p>}
          <div className="form-actions"><button type="button" onClick={() => dialog.current?.close()}>Fechar</button></div>
        </form>
      </dialog>
    </section>
  );
}

function ToleranceControls({ services }: { services: { id: string; title: string }[] }) {
  const [id, setId] = useState(services[0]?.id ?? "");
  const [policy, setPolicy] = useState<ServiceTolerancePolicy | null | undefined>(undefined);
  const [serviceState, setServiceState] = useState("");
  const [mode, setMode] = useState<"off" | "override" | "inherit">("inherit");
  const [days, setDays] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    if (busy || !id) return;
    setBusy(true); setMessage("");
    const [p, a] = await Promise.all([readAltnixServiceTolerancePolicyAction(id), readAltnixServiceAuthorizationAction(id)]);
    if ("error" in p) setMessage(p.error); else { setPolicy(p.policy); if (p.policy) { setMode(p.policy.mode === "off" ? "inherit" : p.policy.mode); setDays(p.policy.overrideDays === null ? "" : String(p.policy.overrideDays)); } }
    if (!("error" in a) && a.binding) setServiceState(`${AUTH_LABEL[a.binding.status ?? ""] ?? "Sem decisão"} (entrega: ${a.binding.delivery})`);
    setBusy(false);
  }
  async function save() {
    if (busy || !confirmed) return;
    setBusy(true); setMessage("");
    const result = await configureAltnixServiceToleranceModeAction(id, mode, mode === "override" ? Number(days) : null, true);
    setMessage("error" in result ? result.error : "Política registrada.");
    setBusy(false);
  }
  return (
    <div className="form-grid">
      <h3>Tolerância de inadimplência por serviço</h3>
      <label>Serviço
        <select value={id} onChange={(e) => { setId(e.target.value); setPolicy(undefined); setServiceState(""); }}>
          {services.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </label>
      <button type="button" disabled={busy} onClick={() => void load()}>Consultar política e situação</button>
      {policy !== undefined && (
        <p>{policy === null ? "Serviço sem vínculo habilitado." : `Política: ${policy.mode === "off" ? "desligada" : policy.mode === "inherit" ? "herda o padrão" : "individual"}; padrão geral: ${policy.defaultDays ?? "não definido"}; efetiva: ${policy.effectiveDays ?? "—"} dia(s).`} {serviceState && `Situação do serviço: ${serviceState}.`}</p>
      )}
      {policy && (
        <>
          <label>Modo
            <select value={mode} onChange={(e) => { setMode(e.target.value as "off" | "override" | "inherit"); setConfirmed(false); }}>
              <option value="inherit">Herdar o padrão geral</option><option value="override">Individual (0 a 30 dias)</option><option value="off">Desligar suspensão financeira</option>
            </select>
          </label>
          {mode === "override" && <label>Dias de tolerância<input type="number" min={0} max={30} value={days} onChange={(e) => setDays(e.target.value)} /></label>}
          <label><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Confirmo a política deste serviço</label>
          <button type="button" disabled={busy || !confirmed || (mode === "override" && days.trim() === "")} onClick={() => void save()}>Salvar política</button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
