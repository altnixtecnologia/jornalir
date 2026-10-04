"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { useAuth } from "../../lib/auth/AuthProvider";

/**
 * Entrada do painel interno — tela de acesso, não uma landing page.
 * Supabase Auth real: e-mail + senha, sessão de verdade em cookies
 * (`@supabase/ssr`, Fase 20) — o middleware é quem de fato decide se
 * `/sistema/*` pode ser acessado; esta tela só oferece o formulário.
 */
export default function LoginPage(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useAuth();
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace("/sistema");
  }, [status, router]);

  useEffect(() => {
    if (searchParams.get("erro") === "inativo") {
      setError("Sua conta está inativa. Fale com um administrador do painel.");
    }
  }, [searchParams]);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Informe usuário/e-mail e senha para continuar.");
      return;
    }
    setError(null);
    setPending(true);
    const { error: signInError } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setPending(false);
    if (signInError) {
      setError("E-mail ou senha inválidos.");
      return;
    }
    router.push("/sistema");
    router.refresh();
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/brand/logo-ir.png" alt="Informativo Regional" className="login-logo" />
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
            <div className="login-password-wrap">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword((show) => !show)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                      d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.6 5.6A10.4 10.4 0 0112 5.5c5 0 9 4 10.5 6.5a12.5 12.5 0 01-2.9 3.4M6.4 6.4A13 13 0 001.5 12c1.1 1.9 3 4.3 5.9 5.7a10.4 10.4 0 004.6 1.3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                      d="M1.5 12C3 9.5 7 5.5 12 5.5S21 9.5 22.5 12C21 14.5 17 18.5 12 18.5S3 14.5 1.5 12z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                    <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="login-submit" disabled={pending}>
            {pending ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <span className="login-forgot">Esqueci minha senha</span>
      </div>
    </div>
  );
}
