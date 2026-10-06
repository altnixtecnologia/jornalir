"use client";

import { useEffect, useState, useTransition } from "react";
import type { NfseCertificateInfo } from "@ir/types";
import { getActiveCertificateAction, uploadCertificateAction } from "../../app/sistema/nfse/configuracoes/certificado-actions";

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("pt-BR");
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

/**
 * Upload do certificado digital A1 (Parte 2B) — layout simples:
 * seletor de arquivo + senha mascarada + "Validar e salvar". Depois
 * de configurado, mostra só metadata segura (nunca o arquivo/senha/
 * chave privada — nem o botão permite download). Alertas de validade
 * calculados no cliente (30/15/7 dias), sem job de background.
 */
export function NfseCertificatePanel({ issuerCnpj }: { issuerCnpj: string }): JSX.Element {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [certificate, setCertificate] = useState<NfseCertificateInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getActiveCertificateAction().then((result) => {
      setCertificate(result);
      setLoaded(true);
    });
  }, []);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await uploadCertificateAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCertificate(result.certificate);
      event.currentTarget.reset();
    });
  }

  if (!loaded) return <p className="helper-text">Carregando certificado…</p>;

  const daysLeft = certificate ? daysUntil(certificate.validUntil) : null;
  const expired = daysLeft !== null && daysLeft < 0;
  const expiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30;

  return (
    <div>
      {certificate ? (
        <div className="form-grid" style={{ marginBottom: "0.75rem" }}>
          <div className="form-field">
            <span className="field-label">Titular</span>
            <span>{certificate.subjectName ?? "—"}</span>
          </div>
          <div className="form-field">
            <span className="field-label">CNPJ</span>
            <span>{certificate.subjectCnpj ?? "—"}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Emissor</span>
            <span>{certificate.issuerName ?? "—"}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Status</span>
            <span>
              {expired ? `Expirado em ${formatDate(certificate.validUntil)}` : `Válido até ${formatDate(certificate.validUntil)}`}
              {expiringSoon ? ` — expira em ${daysLeft} dia(s)` : ""}
            </span>
          </div>
        </div>
      ) : (
        <p className="helper-text">Nenhum certificado configurado ainda.</p>
      )}

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <form onSubmit={handleSubmit} className="form-grid">
        <label className="form-field">
          <span className="field-label">{certificate ? "Substituir certificado (.pfx/.p12)" : "Selecionar arquivo (.pfx/.p12)"}</span>
          <input type="file" name="pfxFile" accept=".pfx,.p12" required />
        </label>
        <label className="form-field">
          <span className="field-label">Senha</span>
          <span style={{ display: "flex", gap: "0.5rem" }}>
            <input type={showPassword ? "text" : "password"} name="password" required autoComplete="off" />
            <button type="button" onClick={() => setShowPassword((prev) => !prev)}>
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </span>
        </label>
        <div className="form-field" style={{ gridColumn: "1 / -1" }}>
          <button type="submit" className="form-action-primary" disabled={pending}>
            {pending ? "Validando…" : "Validar e salvar"}
          </button>
        </div>
      </form>
      <p className="helper-text">
        A senha é usada só pelo servidor pra abrir o arquivo e confirmar que o CNPJ do certificado corresponde ao CNPJ do prestador ({issuerCnpj || "configure o CNPJ acima"}) — nunca é armazenada, logada ou enviada de volta ao navegador. Download do certificado/chave não é permitido.
      </p>
    </div>
  );
}
