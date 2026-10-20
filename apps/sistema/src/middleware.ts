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
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("active,role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError || !profile || !profile.active) {
      return NextResponse.redirect(new URL("/login?erro=inativo", request.url));
    }

    // Módulo desligado: impedir também a abertura direta da URL, não só
    // ocultar a opção do menu. A RPC confere o perfil ativo no banco.
    const privileged = profile.role === "owner" || profile.role === "admin";
    const matches = (prefix: string): boolean => pathname === prefix || pathname.startsWith(prefix + "/");
    const isAuditRead = matches("/sistema/configuracoes/auditoria");
    const adminOnly = matches("/sistema/usuarios")
      || matches("/sistema/configuracoes") || matches("/sistema/nfse");
    if (adminOnly && !privileged) {
      // Histórico: operadores podem consultar SOMENTE quando o proprietário
      // conceder acesso. O middleware e a página validam a mesma RPC.
      if (!isAuditRead) {
        return NextResponse.redirect(new URL("/sistema?erro=sem-permissao", request.url), 303);
      }
      const { data: canReadAudit, error: auditError } = await supabase.rpc("can_read_audit_log");
      if (auditError || canReadAudit !== true) {
        return NextResponse.redirect(new URL("/sistema?erro=sem-permissao", request.url), 303);
      }
    }

    let moduleKey: string | null = null;
    if (matches("/sistema/financeiro")) moduleKey = "financeiro";
    else if (matches("/sistema/editorial")) moduleKey = "editorial";
    else if (matches("/sistema/clientes")) moduleKey = "clientes";
    else if (matches("/sistema/assinaturas")) moduleKey = "assinaturas";
    else if (matches("/sistema/publicidade") || matches("/sistema/anuncios") || matches("/sistema/patrocinadores")) moduleKey = "publicidade";
    else if (matches("/sistema/aniversariantes")) moduleKey = "aniversariantes";
    // A Agenda/Pauta é coletiva: todos os membros ATIVOS têm leitura.
    // Criar/editar/cancelar/baixar continuam protegidos pela RLS e RPCs.
    // Não reutilizar staff_can_see_module (matriz antiga) para bloqueá-los.
    else if (matches("/sistema/agenda") || matches("/agenda")) {
      moduleKey = null;
    }
    if (moduleKey && !privileged) {
      const { data: allowed, error: permissionError } = await supabase.rpc(
        "staff_can_see_module", { p_module: moduleKey },
      );
      if (permissionError || allowed !== true) {
        return NextResponse.redirect(new URL("/sistema?erro=sem-permissao", request.url), 303);
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
