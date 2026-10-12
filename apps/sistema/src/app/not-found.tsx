import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../lib/supabase/server";

/**
 * Fallback para URLs inválidas do painel. Se a sessão expirou, o usuário
 * volta direto para o login em vez de ficar preso numa tela 404.
 */
export default async function NotFound(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?erro=sessao");
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <img src="/brand/logo-ir.png" alt="Informativo Regional" className="login-logo" />
        <p className="login-title">Página não encontrada</p>
        <p className="login-subtitle">Este endereço não existe ou não está mais disponível.</p>
        <Link href="/sistema" className="login-submit">
          Voltar ao painel
        </Link>
      </div>
    </main>
  );
}
