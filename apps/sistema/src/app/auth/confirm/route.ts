import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import {
  parseAuthConfirmType,
  isValidAuthTokenHash,
  authConfirmSuccessDestination,
  authConfirmErrorDestination,
  INVALID_LINK_DESTINATION,
} from "../../../lib/auth/authConfirmFlow";

/**
 * Convites e recuperações exigem confirmação humana antes de usar o token.
 *
 * Links em e-mails podem ser abertos automaticamente por pré-visualizações
 * e verificadores de segurança. GET nunca deve consumir um OTP de uso único:
 * mostra apenas um formulário de confirmação. Somente POST chama verifyOtp
 * e grava a sessão via cookies do Supabase SSR.
 *
 * O token nunca é incluído em logs, redirecionamentos ou URLs de destino.
 * O tipo e os destinos são limitados a invite/recovery.
 */
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function invalidLink(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL(INVALID_LINK_DESTINATION, request.url), {
    status: 303,
    headers: PRIVATE_HEADERS,
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = parseAuthConfirmType(request.nextUrl.searchParams.get("type"));
  if (!isValidAuthTokenHash(tokenHash) || !type) return invalidLink(request);

  const isInvite = type === "invite";
  const heading = isInvite ? "Confirme seu convite" : "Confirme a recuperação";
  const detail = isInvite
    ? "Confirme seu acesso para abrir a página de definição de senha do IR Controle."
    : "Confirme a recuperação para abrir a página de nova senha do IR Controle.";
  const button = isInvite ? "Confirmar convite" : "Continuar para nova senha";
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${heading} — Informativo Regional</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;
    background:#f6f4ee;font-family:Arial,Helvetica,sans-serif;color:#16181d;
    padding:20px}
  main{width:100%;max-width:450px;padding:32px 28px;background:#fff;
    border:1px solid #e3e0d5;border-top:4px solid #c03030;border-radius:10px;
    box-shadow:0 7px 30px rgba(22,24,29,.07)}
  h1{font-family:Georgia,serif;font-size:25px;margin:0 0 14px}
  p{font-size:15px;line-height:1.65;color:#485062;margin:0 0 24px}
  button{display:block;width:100%;padding:14px 16px;background:#30305c;
    color:white;border:0;border-radius:6px;font-weight:bold;font-size:14px;
    cursor:pointer}
  button:focus-visible{outline:3px solid #c99700;outline-offset:3px}
  small{display:block;margin-top:24px;text-align:center;color:#697181}
  a{color:#30305c}
</style>
</head>
<body>
<main>
<h1>${heading}</h1>
<p>${detail}</p>
<form method="POST" action="/auth/confirm">
  <input type="hidden" name="token_hash" value="${escapeHtml(tokenHash)}">
  <input type="hidden" name="type" value="${type}">
  <button type="submit">${button}</button>
</form>
<small>Informativo Regional — <a href="/login">Voltar ao login</a></small>
</main>
</body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return invalidLink(request);
  if (request.headers.get("sec-fetch-site") === "cross-site") return invalidLink(request);

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) return invalidLink(request);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return invalidLink(request);
  }

  const rawToken = form.get("token_hash");
  const tokenHash = typeof rawToken === "string" ? rawToken : null;
  const rawType = form.get("type");
  const type = parseAuthConfirmType(typeof rawType === "string" ? rawType : null);
  if (!isValidAuthTokenHash(tokenHash) || !type) return invalidLink(request);

  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch {
    return invalidLink(request);
  }

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    console.error("Supabase Auth verifyOtp falhou:", error.code ?? "unknown");
    return NextResponse.redirect(new URL(authConfirmErrorDestination(type), request.url), {
      status: 303,
      headers: PRIVATE_HEADERS,
    });
  }
  return NextResponse.redirect(new URL(authConfirmSuccessDestination(type), request.url), {
    status: 303,
    headers: PRIVATE_HEADERS,
  });
}
