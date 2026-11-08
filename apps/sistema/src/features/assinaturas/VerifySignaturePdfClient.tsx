"use client";

import { useState } from "react";

/**
 * A conferência usa o PDF escolhido na própria máquina, sem enviar arquivo,
 * dados pessoais ou conteúdo a servidor algum.
 */
export function VerifySignaturePdfClient({ expectedSha256 }: { expectedSha256: string }): JSX.Element {
  const [status, setStatus] = useState<"idle" | "checking" | "match" | "mismatch" | "error">("idle");
  const [digest, setDigest] = useState("");
  const [message, setMessage] = useState("");

  async function check(file: File | undefined): Promise<void> {
    if (!file) return;
    setDigest(""); setMessage("");
    if (file.size === 0 || file.size > 20 * 1024 * 1024 || !file.name.toLowerCase().endsWith(".pdf")) {
      setStatus("error");
      setMessage("Selecione um arquivo PDF de até 20 MB.");
      return;
    }
    if (!globalThis.crypto?.subtle) {
      setStatus("error");
      setMessage("Este navegador não permite verificar o arquivo localmente.");
      return;
    }
    setStatus("checking");
    try {
      const bytes = await file.arrayBuffer();
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      const value = Array.from(new Uint8Array(hash)).map((v) => v.toString(16).padStart(2, "0")).join("");
      setDigest(value);
      setStatus(value === expectedSha256.toLowerCase() ? "match" : "mismatch");
    } catch {
      setStatus("error");
      setMessage("Não foi possível calcular o hash deste arquivo.");
    }
  }

  return (
    <section style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
      <h2 style={{ fontSize: 18 }}>Conferir minha cópia do PDF</h2>
      <p>Selecione o documento recebido para conferir se ele é exatamente a versão deste aceite registrada no sistema. A comparação ocorre <strong>no seu navegador</strong>; o arquivo não é enviado.</p>
      <label style={{ display: "block", marginTop: 12 }}>
        <strong>Selecionar arquivo PDF</strong>
        <input aria-label="Selecionar PDF para conferir hash" type="file" accept=".pdf,application/pdf"
          style={{ display: "block", marginTop: 8 }}
          onChange={(event) => void check(event.currentTarget.files?.[0])} />
      </label>
      {status === "checking" ? <p role="status">Conferindo integridade…</p> : null}
      {status === "match" ? <p role="status" style={{ color: "#166534", fontWeight: 700 }}>O arquivo corresponde exatamente à versão assinada deste aceite.</p> : null}
      {status === "mismatch" ? <p role="alert" style={{ color: "#b91c1c", fontWeight: 700 }}>
        O arquivo não corresponde a esta versão. Pode ser outra versão, um documento alterado ou o PDF consolidado com assinaturas posteriores.
      </p> : null}
      {status === "error" ? <p role="alert">{message}</p> : null}
      {digest ? <p style={{ fontFamily: "monospace", overflowWrap: "anywhere", fontSize: 11 }}>Hash da cópia selecionada: {digest}</p> : null}
    </section>
  );
}
