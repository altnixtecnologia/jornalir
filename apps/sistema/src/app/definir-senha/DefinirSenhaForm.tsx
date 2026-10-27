"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { notify } from "../../lib/feedback/notify";

/**
 * Formulário de definição/redefinição de senha (Fase 20 — correção de
 * ativação). `ready`/`linkExpired` chegam prontos do Server Component
 * (`page.tsx`), que já checou a sessão real contra o Supabase via cookies
 * — não há mais detecção de sessão no navegador (hash/`onAuthStateChange`)
 * nem estado de carregamento: a sessão já foi gravada (ou não) por
 * `/auth/confirm` antes desta página renderizar. Os campos nunca destravam
 * sem essa sessão real.
 */
export default function DefinirSenhaForm({
  ready, isRecovery, linkExpired,
}: { ready: boolean; isRecovery: boolean; linkExpired: boolean }): JSX.Element {
  const router = useRouter();
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setError(null);
    setPending(true);
    const { error: updateError } = await client.auth.updateUser({ password });
    setPending(false);
    if (updateError) {
      notify.error("Não foi possível definir a senha", "Se o link expirou, solicite um novo.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p className="login-title">Senha definida</p>
          <p className="login-subtitle">Sua conta está pronta. Você já pode acessar o painel.</p>
          <button type="button" className="login-submit" onClick={() => router.push("/sistema")}>
            Entrar no painel
          </button>
        </div>
      </div>
    );
  }

  if (linkExpired || !ready) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p className="login-title">{isRecovery ? "Link de recuperação inválido" : "Link de convite inválido"}</p>
          <p className="login-subtitle">
            {isRecovery
              ? "Este link de recuperação expirou ou já foi usado. Solicite outro na tela de login, em \"Esqueci minha senha\"."
              : "Este convite expirou ou já foi usado. Solicite um novo convite à administração do sistema."}
          </p>
          <button type="button" className="login-submit" onClick={() => router.push("/login")}>
            Voltar ao login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="login-title">{isRecovery ? "Redefina sua senha" : "Defina sua senha"}</p>
        <p className="login-subtitle">Informativo Regional — acesso ao painel interno.</p>

        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="new-password">Nova senha</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="login-field">
            <label htmlFor="confirm-password">Confirmar senha</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="login-submit" disabled={pending}>
            {pending ? "Salvando…" : isRecovery ? "Redefinir senha" : "Definir senha"}
          </button>
        </form>
      </div>
    </div>
  );
}
