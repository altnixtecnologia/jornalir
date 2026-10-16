import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isLocalPreviewEnabled } from "./lib/auth/localPreview";

/**
 * Proteção real de `/sistema/*` — server-side, antes de qualquer conteúdo
 * ser renderizado (Fase 20). `AuthGate` (client) continua existindo só
 * para UX (evita um flash de conteúdo enquanto o React hidrata), mas quem
 * de fato barra o acesso é este middleware: roda no servidor, numa
 * requisição que o navegador não consegue pular ou adulterar.
 *
 * `getUser()` (não `getSession()`) — valida o token contra o servidor de
 * Auth do Supabase a cada requisição, em vez de confiar cegamente no que
 * está no cookie. É a diferença entre "alguém tem um cookie" e "esse
 * cookie corresponde a uma sessão real e válida agora".
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  // Visualização local do painel (ver lib/auth/localPreview.ts): só vale
  // com NODE_ENV=development E SYSTEM_LOCAL_PREVIEW=1 ao mesmo tempo — em
  // qualquer outro caso esta função retorna false e a Auth real abaixo
  // continua idêntica a antes.
  if (isLocalPreviewEnabled()) {
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    // Sem Supabase configurado, não há como validar sessão nenhuma — deixa
    // passar (mesmo comportamento de antes desta fase) em vez de travar o
    // ambiente inteiro por uma variável de ambiente ausente.
    return response;
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = pathname.startsWith("/sistema") || pathname.startsWith("/agenda");
  const isLogin = pathname === "/login";

  if (isProtected) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("active, role")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || !profile.active) {
      return NextResponse.redirect(new URL("/login?erro=inativo", request.url));
    }
    // A proteção do módulo vale também quando o usuário digita a URL.
    if (profile.role === "operator") {
      if (pathname === "/sistema/nfse" || pathname.startsWith("/sistema/nfse/") || pathname === "/sistema/configuracoes/cobrancas" || pathname.startsWith("/sistema/configuracoes/cobrancas/") || pathname === "/sistema/configuracoes/contratos" || pathname.startsWith("/sistema/configuracoes/contratos/")) {
        return NextResponse.redirect(new URL("/sistema?acesso=negado", request.url));
      }
      if (pathname === "/sistema/financeiro/relatorios/imprimir" || pathname.startsWith("/sistema/financeiro/relatorios/imprimir/") ||
          pathname === "/sistema/financeiro/recibos/imprimir" || pathname.startsWith("/sistema/financeiro/recibos/imprimir/")) {
        const { data: canExport, error: exportError } = await supabase.rpc("staff_can_finance_action", { p_action: "relatorios_exportar" });
        if (exportError || canExport !== true) return NextResponse.redirect(new URL("/sistema?acesso=negado", request.url));
      }
      if (pathname === "/sistema/financeiro/relatorios" || pathname.startsWith("/sistema/financeiro/relatorios/")) {
        const { data: canView, error: viewError } = await supabase.rpc("staff_can_finance_action", { p_action: "relatorios_ver" });
        if (viewError || canView !== true) {
          return NextResponse.redirect(new URL("/sistema?acesso=negado", request.url));
        }
      }
      const modules: Array<[string, string]> = [
        ["/sistema/financeiro", "financeiro"],
        ["/sistema/configuracoes/cobrancas", "financeiro"],
        ["/sistema/clientes", "clientes"],
        ["/sistema/assinaturas", "assinaturas"],
        ["/sistema/publicidade", "publicidade"],
        ["/sistema/comercial", "publicidade"],
        ["/sistema/aniversariantes", "aniversariantes"],
        ["/sistema/editorial", "editorial"],
        ["/sistema/anuncios", "publicidade"],
        ["/sistema/patrocinadores", "publicidade"],
      ];
      const selected = modules.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"));
      if (selected) {
        const { data: allowed, error } = await supabase.rpc("staff_can_see_module", { p_module: selected[1] });
        if (error || allowed !== true) {
          return NextResponse.redirect(new URL("/sistema?acesso=negado", request.url));
        }
      }
    }
  }

  if (isLogin && user) {
    return NextResponse.redirect(new URL("/sistema", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/sistema/:path*", "/agenda/:path*", "/login"],
};
