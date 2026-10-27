import { createSupabaseServerClient } from "../../lib/supabase/server";
import DefinirSenhaForm from "./DefinirSenhaForm";

/**
 * Destino do link de convite/recuperação, depois de passar por
 * `/auth/confirm` (Fase 20 — correção de ativação). A sessão já foi
 * gravada nos cookies por aquela rota via `verifyOtp` ANTES deste
 * redirecionamento — então a checagem aqui é server-side, contra o
 * Supabase (`getUser()`, nunca um cookie não verificado), sem nenhuma
 * detecção de sessão no navegador. Rota pública de propósito (fora de
 * `/sistema`, fora do matcher do middleware): sem senha definida ainda
 * não faz sentido exigir sessão completa do painel.
 */
export default async function DefinirSenhaPage({
  searchParams,
}: {
  searchParams: { recovery?: string; erro?: string };
}): Promise<JSX.Element> {
  const isRecovery = searchParams.recovery === "1";
  const linkExpired = searchParams.erro === "link-expirado";

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  const hasRealSession = Boolean(data.user) && !error;

  return (
    <DefinirSenhaForm
      ready={hasRealSession}
      isRecovery={isRecovery}
      linkExpired={linkExpired || !hasRealSession}
    />
  );
}
