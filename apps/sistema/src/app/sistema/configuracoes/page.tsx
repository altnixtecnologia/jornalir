import Link from "next/link";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { checkFinanceAction } from "../../../lib/permissions/checkFinanceAction";

export default async function ConfiguracoesPage(): Promise<JSX.Element> {
  const db = createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  const { data: profile } = user ? await db.from("profiles").select("role,active").eq("id", user.id).maybeSingle() : { data: null };
  const isOwner = Boolean(profile?.active && profile.role === "owner");
  const isAdminOrOwner = Boolean(profile?.active && (profile.role === "owner" || profile.role === "admin"));
  const [{data:isBusinessCoowner},{data:canManageSponsors},{data:canReadAudit},modelosDenied] = await Promise.all([
    user && isAdminOrOwner ? db.rpc("is_business_coowner") : Promise.resolve({data:false}),
    user ? db.rpc("staff_can_module_action",{
      p_module:"configuracoes",p_action:"patrocinadores_gerenciar",
    }) : Promise.resolve({data:false}),
    user ? db.rpc("can_read_audit_log") : Promise.resolve({data:false}),
    user ? checkFinanceAction("contratos_editar") : Promise.resolve("Sem sessão"),
  ]);
  const canUseModels = isAdminOrOwner || modelosDenied === null;
  return (
    <>
      <ModuleHeader eyebrow="CONFIGURAÇÕES" title="Configurações" description="Preferências e organização do ambiente de trabalho." />
      <section className="form-section form-section--first">
        <h2>Áreas</h2>
        <div className="form-grid">
          {isAdminOrOwner ? <Link className="materia-title-link" href="/sistema/usuarios">Usuários</Link> : null}
          {isOwner ? <Link className="materia-title-link" href="/sistema/configuracoes/assistente-ir">Assistente IR — Inteligência artificial</Link> : null}
          {isAdminOrOwner ? <Link className="materia-title-link" href="/sistema/configuracoes/empresa">Dados da empresa e representante legal</Link> : null}
          {canUseModels ? <Link className="materia-title-link" href="/sistema/configuracoes/modelos-contratos">Modelos de contratos</Link> : null}
          {canManageSponsors === true ? <Link className="materia-title-link" href="/sistema/configuracoes/patrocinadores">Patrocinadores do site</Link> : null}
          {canReadAudit === true ? <Link className="materia-title-link" href="/sistema/configuracoes/auditoria">Auditoria e Atividades</Link> : null}
          {isAdminOrOwner ? <Link className="materia-title-link" href="/sistema/configuracoes/tv-pauta">TV Pauta — autorizar e gerenciar televisões</Link> : null}
          {isAdminOrOwner&&!isBusinessCoowner?<Link className="materia-title-link" href="/sistema/configuracoes/aplicativo">Aplicativo Jornal IR — versões e APK</Link>:null}
          {isAdminOrOwner ? <Link className="materia-title-link" href="/sistema/configuracoes/valores-assine">Valores da página Assine</Link> : null}
          {!isAdminOrOwner && canManageSponsors !== true && !canUseModels && canReadAudit !== true
            ? <p className="helper-text">Nenhuma área adicional liberada. Peça ao administrador para selecionar as ações necessárias em Usuários.</p> : null}
        </div>
      </section>
    </>
  );
}
