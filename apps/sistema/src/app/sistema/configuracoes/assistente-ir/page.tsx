import Link from "next/link";
import { redirect } from "next/navigation";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { AiAssistantSettingsPanel } from "../../../../features/configuracoes/AiAssistantSettingsPanel";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { loadAssistantOwnerSnapshot } from "../../../../lib/ai/assistantConfig";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AssistantIrSettingsPage(): Promise<JSX.Element> {
  const db = createSupabaseServerClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: profile } = await db.from("profiles")
    .select("role,active").eq("id", user.id).maybeSingle();
  if (!profile?.active || profile.role !== "owner") redirect("/sistema?acesso=negado");

  const values = await loadAssistantOwnerSnapshot();
  return (
    <>
      <ModuleHeader
        eyebrow="CONFIGURAÇÕES / INTELIGÊNCIA ARTIFICIAL"
        title="Assistente IR"
        description="Controle do proprietário: provedores, módulos e autonomia. Nenhuma operação sensível é executada sem aprovação."
        action={<Link className="btn btn-secondary" href="/sistema/assistente-ir">Abrir conversa com IA</Link>}
      />
      <AiAssistantSettingsPanel initial={values} />
    </>
  );
}
