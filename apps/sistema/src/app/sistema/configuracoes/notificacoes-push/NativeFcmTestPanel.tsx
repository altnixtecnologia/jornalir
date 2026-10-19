"use client";

import { useState, useTransition } from "react";
import { sendTestNativePushAction } from "./actions";

export type NativeFcmTestDevice = {
  id: string;
  ordinary: boolean;
  urgent: boolean;
  lastSeenAt: string;
};

export function NativeFcmTestPanel({ enabled, devices }: {
  enabled: boolean;
  devices: NativeFcmTestDevice[];
}): JSX.Element {
  const [selected, setSelected] = useState(devices[0]?.id ?? "");
  const [kind, setKind] = useState<"ordinary" | "urgent">("ordinary");
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const device = devices.find((d) => d.id === selected);
  const typeAllowed = Boolean(device && (kind === "urgent" ? device.urgent : device.ordinary));

  function send(): void {
    if (!enabled || !device || !typeAllowed || busy) return;
    if (!window.confirm("Enviar UM teste " + (kind === "urgent" ? "URGENTE" : "NORMAL") +
      " somente ao aparelho " + device.id.slice(0, 8) + "…?")) return;
    setMessage("");
    const form = new FormData();
    form.set("deviceId", device.id);
    form.set("kind", kind);
    startTransition(async () => {
      const result = await sendTestNativePushAction(form);
      setMessage(result.ok ? "Mensagem aceita pelo Firebase para este aparelho. Verifique no Android." :
        result.error || "Falha no teste.");
    });
  }

  return (
    <section className="form-section" aria-label="Teste individual de notificações Android">
      <h2>Teste individual — Android</h2>
      <p className="helper-text">
        Apenas administradores. Um aparelho selecionado por vez. Nenhum disparo geral,
        evento editorial ou envio a outros leitores. O envio de teste não habilita a fila automática.
      </p>
      {!enabled ? <p className="helper-text">Envio individual de teste desativado.</p> : null}
      {enabled && devices.length === 0 ? <p className="helper-text">
        Nenhum Android inscrito ainda. Abra o Jornal IR instalado, entre em Notificações e ative os avisos.
      </p> : null}
      {enabled && devices.length > 0 ? (
        <div className="form-grid">
          <label><span className="field-label">Aparelho de destino</span>
            <select value={selected} onChange={(e) => { setSelected(e.target.value); setMessage(""); }} disabled={busy}>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id.slice(0, 8)}… — visto {new Date(d.lastSeenAt).toLocaleString("pt-BR")}
                </option>
              ))}
            </select>
          </label>
          <label><span className="field-label">Tipo do aviso</span>
            <select value={kind} onChange={(e) => { setKind(e.target.value as "ordinary" | "urgent"); setMessage(""); }} disabled={busy}>
              <option value="ordinary">Normal (som padrão)</option>
              <option value="urgent">Urgente (som personalizado)</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="button" className="form-action-primary" disabled={busy || !typeAllowed} onClick={send}>
              {busy ? "Enviando..." : "Enviar teste para este aparelho"}
            </button>
          </div>
        </div>
      ) : null}
      {enabled && device && !typeAllowed ? <p className="helper-text">Este aparelho não autorizou avisos deste tipo.</p> : null}
      {message ? <p className="helper-text" role="status">{message}</p> : null}
    </section>
  );
}
