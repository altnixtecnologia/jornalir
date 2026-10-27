import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import {
  parseAuthConfirmType,
  authConfirmSuccessDestination,
  authConfirmErrorDestination,
  INVALID_LINK_DESTINATION,
} from "../../../lib/auth/authConfirmFlow";

/**
 * Troca `token_hash` por sessão real (Fase 20 — correção de ativação).
 *
 * Convites/recuperações são emitidos pela Admin API (service_role), sem
 * `code_verifier` no navegador de quem recebe o e-mail: o cliente do
 * navegador (`@supabase/ssr`, `flowType: "pkce"`) nunca consegue concluir
 * a troca por `?code=...` sozinho (não há verifier salvo), e o e-mail
 * padrão do Supabase ("ConfirmationURL") resolve isso no servidor do
 * Supabase antes do clique chegar aqui — por isso os campos de senha
 * ficavam desabilitados para sempre. `verifyOtp({ token_hash, type })` não
 * depende de nenhum estado salvo no navegador: valida o token direto
 * contra o Auth e grava a sessão real nos cookies (via `createSupabaseServerClient`)
 * antes do redirecionamento, então `/definir-senha` já abre com sessão válida.
 *
 * O destino é decidido só pelo `type` validado (ver `authConfirmFlow.ts`),
 * nunca por parâmetro vindo da URL — sem superfície de redirecionamento
 * aberto. Nunca logar o token.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = parseAuthConfirmType(params.get("type"));

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL(INVALID_LINK_DESTINATION, request.url));
  }

  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch {
    return NextResponse.redirect(new URL(INVALID_LINK_DESTINATION, request.url));
  }

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    console.error("Supabase Auth verifyOtp falhou:", error.code ?? "unknown");
    return NextResponse.redirect(new URL(authConfirmErrorDestination(type), request.url));
  }

  return NextResponse.redirect(new URL(authConfirmSuccessDestination(type), request.url));
}
