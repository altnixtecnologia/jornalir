"use client";

import { useRef, useState, useTransition } from "react";
import {
  completeSignatureInvitationAction, requestSignerEmailCodeAction, verifySignerEmailCodeAction,
} from "../../app/sistema/financeiro/contratos/signature-actions";

export function ContractSignerCanvas({
  token, name, documentName, expiresAt,
}: { token: string; name: string; documentName: string; expiresAt: string }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [signed, setSigned] = useState(false);
  const [fullName, setFullName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [consent, setConsent] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function coords(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * e.currentTarget.width / rect.width,
      y: (e.clientY - rect.top) * e.currentTarget.height / rect.height };
  }
  function pointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    e.preventDefault();
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const context = e.currentTarget.getContext("2d");
    if (!context) return;
    const { x, y } = coords(e);
    context.beginPath(); context.moveTo(x, y);
    context.lineWidth = 3.5; context.lineCap = "round"; context.strokeStyle = "#183660";
  }
  function pointerMove(e: React.PointerEvent<HTMLCanvasElement>): void {
    if (!drawing.current) return;
    e.preventDefault();
    const context = e.currentTarget.getContext("2d");
    if (!context) return;
    const { x, y } = coords(e);
    context.lineTo(x, y); context.stroke();
    setHasStroke(true);
  }
  function pointerUp(e: React.PointerEvent<HTMLCanvasElement>): void {
    drawing.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function clear(): void {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  }
  function sendEmailCode(): void {
    setError("");
    startTransition(async () => {
      const result = await requestSignerEmailCodeAction(token);
      if ("error" in result) { setError(result.error); return; }
      setOtpSent(true);
    });
  }
  function verifyEmailCode(): void {
    setError("");
    startTransition(async () => {
      const result = await verifySignerEmailCodeAction(token, otpCode);
      if ("error" in result) { setError(result.error); return; }
      setOtpVerified(true);
    });
  }

  function submit(): void {
    setError("");
    if (!otpVerified) {
      setError("Confirme o código de e-mail antes de assinar.");
      return;
    }
    if (!consent || !hasStroke || !fullName.trim() || !signerEmail.trim()) {
      setError("Confira o PDF, informe seu nome, desenhe sua assinatura e aceite o termo.");
      return;
    }
    const imageDataUrl = canvasRef.current?.toDataURL("image/png") ?? "";
    startTransition(async () => {
      try {
        const result = await completeSignatureInvitationAction({
          token, signerName: fullName, signerEmail, consent, imageDataUrl,
        });
        if ("error" in result) { setError(result.error); return; }
        setSigned(true);
      } catch {
        setError("Não foi possível concluir a assinatura. Verifique a conexão e tente novamente.");
      }
    });
  }
  if (signed) return (
    <section className="form-section" role="status">
      <h2>Assinatura recebida</h2>
      <p>O aceite foi registrado e o comprovante de assinatura eletrônica foi vinculado ao contrato.</p>
      <p className="helper-text">O responsável pelo contrato pode baixar o comprovante no painel.</p>
    </section>
  );
  return (
    <section className="form-section">
      <h2>Conferir e assinar</h2>
      <p>Documento: <strong>{documentName}</strong></p>
      <p className="helper-text">
        Convite para {name}. Válido até {new Date(expiresAt).toLocaleString("pt-BR")}.
        Leia o PDF completo antes de continuar.
      </p>
      <iframe src={"/api/assinar-contrato/" + token + "/documento"}
        title="Documento original para assinatura" style={{ width: "100%", height: "min(66vh,720px)", border: "1px solid #ccc" }} />
      <label className="form-field" style={{ display: "block", marginTop: 20 }}>
        <span className="field-label">Seu nome completo, como consta no convite</span>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={180}
          autoComplete="name" />
      </label>
      <label className="form-field" style={{ display: "block", marginTop: 12 }}>
        <span className="field-label">Confirme seu e-mail informado no convite</span>
        <input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)}
          autoComplete="email" maxLength={254} />
      </label>
      <div className="form-field" style={{ marginTop: 16 }}>
        <span className="field-label">Confirmação do e-mail do convite</span>
        {otpVerified ? <p role="status">E-mail confirmado para esta sessão.</p> : (
          <>
            <p className="helper-text">
              Enviamos um código somente para o e-mail cadastrado no convite.
              Não é possível assinar sem confirmá-lo.
            </p>
            <button type="button" onClick={sendEmailCode} disabled={pending}>
              {otpSent ? "Reenviar código" : "Enviar código de confirmação"}
            </button>
            {otpSent ? (
              <div className="form-actions" style={{ marginTop: 8 }}>
                <input value={otpCode} onChange={(e) => setOtpCode(e.target.value)}
                  inputMode="numeric" autoComplete="one-time-code" placeholder="Código de e-mail"
                  aria-label="Código enviado para o e-mail do convite" maxLength={8} />
                <button type="button" onClick={verifyEmailCode} disabled={pending || otpCode.length < 6}>
                  Confirmar código
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
      <p className="field-label">Desenhe sua assinatura com dedo, caneta ou mouse</p>
      <canvas ref={canvasRef} width={700} height={230}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
        onPointerCancel={pointerUp} style={{
          display: "block", width: "100%", maxWidth: 700, height: 210, touchAction: "none",
          border: "1px solid #aab5c1", borderRadius: 8, background: "#fff", cursor: "crosshair",
        }} aria-label="Área para desenhar a assinatura" />
      <button type="button" onClick={clear} disabled={pending} style={{ marginTop: 8 }}>Limpar assinatura</button>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 16 }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Declaro que li e conferi o documento, que sou o signatário indicado e que concordo em
          registrar minha assinatura eletrônica. O sistema guarda a data, o comprovante, a imagem
          da assinatura e informações técnicas de auditoria vinculadas ao PDF original.</span>
      </label>
      <p className="helper-text">
        Este método registra aceite eletrônico e evidências, mas não equivale automaticamente
        a uma assinatura digital qualificada ICP-Brasil.
      </p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-actions">
        <button type="button" className="form-action-primary" onClick={submit}
          disabled={pending || !otpVerified || !consent || !hasStroke || !fullName.trim() || !signerEmail.trim()}>
          {pending ? "Registrando…" : "Confirmar assinatura eletrônica"}
        </button>
      </div>
    </section>
  );
}
