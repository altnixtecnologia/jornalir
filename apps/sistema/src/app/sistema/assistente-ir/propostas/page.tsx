import Link from "next/link";
import { redirect } from "next/navigation";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { AiAssistantProposalsPanel } from "../../../../features/configuracoes/AiAssistantProposalsPanel";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { listAssistantProposalsAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AssistentePropostasPage(): Promise<JSX.Element> {
  const db = createSupabaseServerClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: profile } = await db.from("profiles")
    .select("role,active").eq("id", user.id).maybeSingle();
  if (!profile?.active || profile.role !== "owner") redirect("/sistema?acesso=negado");
  const result = await listAssistantProposalsAction();
  return (
    <>
      <ModuleHeader eyebrow="SISTEMA / ASSISTENTE IR"
        title="Propostas para aprovação"
        description="Revisão de sugestões da IA. Aprovar não executa mudanças em outros módulos."
        action={<Link className="btn btn-secondary" href="/sistema/assistente-ir">Conversar com IA</Link>} />
      {"error" in result ? <p className="form-error" role="alert">{result.error}</p> : null}
      <AiAssistantProposalsPanel initial={"ok" in result ? result.data : []} />
    </>
  );
}
