import Link from "next/link";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export default async function ConfiguracoesPage(): Promise<JSX.Element> {
  const db = createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  const { data: profile } = user ? await db.from("profiles").select("role,active").eq("id", user.id).maybeSingle() : { data: null };
  const isOwner = Boolean(profile?.active && profile.role === "owner");
  const isAdminOrOwner = Boolean(profile?.active && (profile.role === "owner" || profile.role === "admin"));
  const {data:isBusinessCoowner}=user&&isAdminOrOwner
    ?await db.rpc("is_business_coowner"):{data:false};
  return (
    <>
      <ModuleHeader eyebrow="CONFIGURAÇÕES" title="Configurações" description="Preferências e organização do ambiente de trabalho." />
      <section className="form-section form-section--first">
        <h2>Áreas</h2>
        <div className="form-grid">
          <Link className="materia-title-link" href="/sistema/usuarios">Usuários</Link>
          {isOwner ? <Link className="materia-title-link" href="/sistema/configuracoes/assistente-ir">Assistente IR — Inteligência artificial</Link> : null}
          {isAdminOrOwner ? <Link className="materia-title-link" href="/sistema/configuracoes/empresa">Dados da empresa e representante legal</Link> : null}
          <Link className="materia-title-link" href="/sistema/configuracoes/modelos-contratos">Modelos de contratos</Link>
          <Link className="materia-title-link" href="/sistema/configuracoes/patrocinadores">Patrocinadores do site</Link>
          {isAdminOrOwner ? <Link className="materia-title-link" href="/sistema/configuracoes/tv-pauta">TV Pauta — autorizar e gerenciar televisões</Link> : null}
          {!isBusinessCoowner?<Link className="materia-title-link" href="/sistema/configuracoes/aplicativo">Aplicativo Jornal IR — versões e APK</Link>:null}
          <Link className="materia-title-link" href="/sistema/configuracoes/valores-assine">Valores da página Assine</Link>
        </div>
      </section>
    </>
  );
}
