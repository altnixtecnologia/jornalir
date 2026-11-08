import "server-only";
import { createSupabaseServerClient } from "../supabase/server";

/**
 * Poder de assinar contratos comerciais pela empresa — CONCESSÃO EXPLÍCITA
 * para todos, inclusive administrador e proprietário (08/11/2026). Diferente
 * de `checkModuleAction`, aqui o papel NÃO libera nada: só vale uma
 * concessão registrada (`publicidade.contratos_assinar`, allowed=true) para
 * o usuário ativo. A regra geral de acesso administrativo dos outros módulos
 * não muda. Devolve `null` quando autorizado, ou a mensagem de erro — mesmo
 * contrato de `checkModuleAction`.
 */
export async function checkContractSigningGrant(): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return "Sessão inválida. Faça login novamente.";
  const { data, error } = await supabase.rpc("staff_can_sign_commercial_contracts");
  if (error) return "Não foi possível verificar a permissão de assinar contratos.";
  return data === true ? null : "Você não tem a concessão para assinar contratos comerciais.";
}
