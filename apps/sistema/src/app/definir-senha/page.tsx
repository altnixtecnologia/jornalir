"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

/**
 * Destino do link de convite (Server Action `inviteUser`, Fase 20). O
 * clique no link já autentica a pessoa temporariamente (token do próprio
 * convite); aqui ela só define a senha real — depois disso, login normal
 * por e-mail + senha (`signInWithPassword`) passa a funcionar. Rota
 * pública de propósito (fora de `/sistema`, fora do matcher do
 * middleware) — sem senha definida ainda não faz sentido exigir sessão
 * completa do painel.
 */
export default function DefinirSenhaPage(): JSX.Element {
  const router = useRouter();
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [ready, setReady] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active=true;
    const recovery = new URLSearchParams(window.location.search).get("recovery") === "1";
    setIsRecovery(recovery);
    // O Supabase pode processar o fragmento da URL e gravar a sessão
    // DEPOIS do primeiro getSession(). Escutar o evento evita declarar
    // falsamente um convite inválido nesse intervalo.
    const {data:listener}=client.auth.onAuthStateChange((_event,session)=>{
      if(!active) return;
      if(session?.user){
        setReady(true);
        setError(null);
      }
    });
    void client.auth.getSession().then(({data,error})=>{
      if(!active) return;
      if(data.session?.user){
        setReady(true);
        setError(null);
      }else if(error){
        setError("Não foi possível verificar o link. Confira a conexão e solicite outro se necessário.");
      }else{
        // Ainda pode ocorrer um evento SIGNED_IN após o getSession.
        setError(recovery
          ? "Aguardando confirmação do link de recuperação. Se ele expirou, solicite outro na tela de login."
          : "Aguardando confirmação do convite. Se ele expirou, solicite novo convite ao administrador.");
      }
    });
    return ()=>{active=false;listener.subscription.unsubscribe();};
  }, [client]);

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
      setError("Não foi possível definir a senha. Tente novamente.");
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
              disabled={!ready}
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
              disabled={!ready}
            />
          </div>

          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="login-submit" disabled={!ready || pending}>
            {pending ? "Salvando…" : isRecovery ? "Redefinir senha" : "Definir senha"}
          </button>
        </form>
      </div>
    </div>
  );
}
