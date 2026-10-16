"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

/** Só permite atualizar a senha após uma sessão validada pelo link de recuperação. */
export default function RedefinirSenhaPage(): JSX.Element {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let mounted = true;
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hasRecoveryMarker = query.get("recovery") === "1" || hash.get("type") === "recovery";

    if (!hasRecoveryMarker) {
      setChecking(false);
      setError("Abra o link de redefinição enviado por e-mail.");
      return;
    }

    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" && session) {
        setReady(true);
        setError(null);
        setChecking(false);
      }
    });

    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      const valid = !sessionError && Boolean(data.session);
      setReady(valid);
      setChecking(false);
      if (!valid) setError("Link inválido ou expirado. Solicite um novo link.");
    }).catch(() => {
      if (!mounted) return;
      setChecking(false);
      setError("Não foi possível validar o link. Solicite outro.");
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [client]);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!ready || saving) return;
    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("As senhas não coincidem.");
      return;
    }
    setError(null);
    setSaving(true);
    const { error: changeError } = await client.auth.updateUser({ password });
    if (changeError) {
      setSaving(false);
      setError("Não foi possível alterar a senha. Solicite um novo link e tente novamente.");
      return;
    }
    await client.auth.signOut();
    setDone(true);
    setSaving(false);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/brand/logo-ir.png" alt="Informativo Regional" className="login-logo" />
        <p className="login-title">Definir nova senha</p>
        {done ? (
          <>
            <p className="login-subtitle" role="status">Senha atualizada. Entre novamente com seu e-mail e a nova senha.</p>
            <Link className="login-forgot" href="/login">Ir para o login</Link>
          </>
        ) : (
          <>
            <p className="login-subtitle">Escolha uma nova senha com pelo menos 8 caracteres.</p>
            {checking ? <p className="helper-text">Validando link…</p> : null}
            {error ? <p className="login-error" role="alert">{error}</p> : null}
            {ready && !checking ? (
              <form onSubmit={handleSubmit}>
                <div className="login-field">
                  <label htmlFor="reset-password">Nova senha</label>
                  <input id="reset-password" type="password" autoComplete="new-password"
                    value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
                </div>
                <div className="login-field">
                  <label htmlFor="reset-confirmation">Confirmar nova senha</label>
                  <input id="reset-confirmation" type="password" autoComplete="new-password"
                    value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={8} />
                </div>
                <button type="submit" className="login-submit" disabled={saving}>
                  {saving ? "Salvando…" : "Salvar nova senha"}
                </button>
              </form>
            ) : null}
            <Link className="login-forgot" href="/recuperar-senha">Solicitar outro link</Link>
          </>
        )}
      </div>
    </div>
  );
}
