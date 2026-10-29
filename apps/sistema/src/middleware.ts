import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isLocalPreviewEnabled } from "./lib/auth/localPreview";
import { canEnterStaffPanel } from "./lib/auth/staffAccessPolicy";
import { NFSE_AVAILABLE_IN_THIS_RELEASE } from "./lib/release/releasePolicy";

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
    // Sem autenticação configurada NUNCA renderizar dados protegidos.
    // O login público continua disponível para diagnóstico.
    return request.nextUrl.pathname.startsWith("/sistema") ||
      request.nextUrl.pathname.startsWith("/agenda")
      ? NextResponse.json({ error: "Autenticação do painel indisponível." },
        { status: 503, headers: { "Cache-Control": "no-store" } })
      : response;
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

  if (isProtected || (isLogin && user)) {
    const { data: profile, error: profileError } = user
      ? await supabase.from("profiles")
        .select("active,role").eq("id",user.id).maybeSingle()
      : { data:null,error:null };
    // A confirmação do email vem do Auth real, não de user_metadata.
    const {data:authorized,error:authzError}=user && profile?.active &&
      user.email_confirmed_at
      ? await supabase.rpc("is_active_staff")
      : {data:false,error:null};
    const eligible=canEnterStaffPanel({
      authenticated:Boolean(user),
      emailConfirmed:Boolean(user?.email_confirmed_at),
      profileActive:Boolean(profile?.active&&!profileError),
      role:profile?.role??null,
      databaseStaffApproved:authorized===true && !authzError,
    });

    if (isLogin) {
      // Conta inativa/não confirmada pode abrir o login, sem loop.
      if (eligible) return NextResponse.redirect(new URL("/sistema",request.url));
      return response;
    }
    if (!eligible) {
      const reason=!user?"sessao":!user.email_confirmed_at?"pendente":"inativo";
      return NextResponse.redirect(new URL("/login?erro="+reason,request.url));
    }

    // Módulo desligado: negar acesso por URL, não apenas esconder no menu.
    const privileged=profile?.role==="owner"||profile?.role==="admin";
    const matches=(prefix:string):boolean =>
      pathname===prefix||pathname.startsWith(prefix+"/");
    // A EMISSÃO de NFS-e foi adiada até após o release: barrar acesso
    // direto a toda rota de emissão (notas, rascunhos, nova, perfis de
    // serviço). A ÚNICA exceção é /sistema/nfse/configuracoes, que
    // fica disponível só pra Proprietário/Admin ativo (checagem de
    // `privileged` abaixo), pra permitir cadastro fiscal e certificado
    // A1 antes da liberação de emissão — nunca abre rota de emissão.
    const isNfseConfigPath = matches("/sistema/nfse/configuracoes");
    if (!NFSE_AVAILABLE_IN_THIS_RELEASE && matches("/sistema/nfse") && !isNfseConfigPath) {
      return NextResponse.redirect(new URL("/sistema?modulo=nfse-adiado", request.url), 303);
    }
    if (!NFSE_AVAILABLE_IN_THIS_RELEASE && isNfseConfigPath && !privileged) {
      return NextResponse.redirect(new URL("/sistema?modulo=nfse-adiado", request.url), 303);
    }
    const adminOnly=matches("/sistema/usuarios") ||
      matches("/sistema/configuracoes") || matches("/sistema/nfse");
    if(adminOnly&&!privileged){
      return NextResponse.redirect(new URL("/sistema?erro=sem-permissao",request.url),303);
    }
    let moduleKey:string|null=null;
    if(matches("/sistema/financeiro")) moduleKey="financeiro";
    else if(matches("/sistema/editorial")) moduleKey="editorial";
    else if(matches("/sistema/clientes")) moduleKey="clientes";
    else if(matches("/sistema/assinaturas")) moduleKey="assinaturas";
    else if(matches("/sistema/publicidade")||matches("/sistema/anuncios")
      ||matches("/sistema/patrocinadores")) moduleKey="publicidade";
    else if(matches("/sistema/aniversariantes")) moduleKey="aniversariantes";
    else if(matches("/sistema/agenda")||matches("/agenda")){
      moduleKey=request.nextUrl.searchParams.get("view")==="pauta"?"pauta":"agenda";
    }
    if(moduleKey&&!privileged){
      const {data:allowed,error:permissionError}=await supabase.rpc(
        "staff_can_see_module",{p_module:moduleKey},
      );
      if(permissionError||allowed!==true){
        return NextResponse.redirect(new URL("/sistema?erro=sem-permissao",request.url),303);
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/sistema/:path*", "/agenda/:path*", "/login"],
};
