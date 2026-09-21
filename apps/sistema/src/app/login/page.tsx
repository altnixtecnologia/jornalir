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

          <button type="submit" className="login-submit" disabled={pending}>
            {pending ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <span className="login-forgot">Esqueci minha senha</span>
      </div>
    </div>
  );
}
