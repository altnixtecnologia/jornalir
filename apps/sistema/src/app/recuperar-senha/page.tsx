"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

/** Recuperação pública: não revela se um e-mail existe no sistema. */
export default function RecuperarSenhaPage(): JSX.Element {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (sending || !email.trim()) return;
    setSending(true);
    try {
      await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: new URL("/redefinir-senha?recovery=1", window.location.origin).toString(),
      });
    } catch {
      // Resposta uniforme: não divulgar existência da conta.
    } finally {
      setSent(true);
      setSending(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/brand/logo-ir.png" alt="Informativo Regional" className="login-logo" />
        <p className="login-title">Recuperar senha</p>
        <p className="login-subtitle">
          Informe o e-mail cadastrado para receber um link seguro de redefinição.
        </p>
        {sent ? (
          <p className="helper-text" role="status">
            Se este e-mail estiver cadastrado, você receberá um link para definir uma nova senha.
            Verifique também a pasta de spam.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="recovery-email">E-mail</label>
              <input id="recovery-email" type="email" autoComplete="email"
                value={email} onChange={(event) => setEmail(event.target.value)}
                placeholder="seuemail@exemplo.com" required />
            </div>
            <button type="submit" className="login-submit" disabled={sending}>
              {sending ? "Solicitando…" : "Enviar link de recuperação"}
            </button>
          </form>
        )}
        <Link className="login-forgot" href="/login">Voltar para o login</Link>
      </div>
    </div>
  );
}
