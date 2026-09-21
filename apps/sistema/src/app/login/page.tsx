"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { hasMockSession, setMockSession } from "../../lib/mockSession";

/**
 * Entrada do painel interno — tela de acesso, não uma landing page.
 * Fluxo visual/estruturado (sem backend real ainda): validar campos
 * preenchidos, marcar a sessão mock e seguir para o painel.
 */
export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasMockSession()) router.replace("/sistema");
  }, [router]);

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Informe usuário/e-mail e senha para continuar.");
      return;
    }
    setError(null);
    setMockSession();
    router.push("/sistema");
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/brand/logo-escrita.png" alt="Informativo Regional" className="login-logo" />
        <p className="login-title">Acesso ao painel</p>
        <p className="login-subtitle">Área restrita da equipe do Informativo Regional.</p>

        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="login-email">Usuário ou e-mail</label>
            <input
              id="login-email"
              type="text"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nome@informativoregional.com.br"
            />
          </div>
          <div className="login-field">
            <label htmlFor="login-password">Senha</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="login-submit">
            Entrar
          </button>
        </form>

        <span className="login-forgot">Esqueci minha senha</span>
      </div>
    </div>
  );
}
