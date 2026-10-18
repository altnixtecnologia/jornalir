import Link from "next/link";
import { redirect } from "next/navigation";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { AiAssistantChatPanel } from "../../../features/configuracoes/AiAssistantChatPanel";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { loadAssistantOwnerSnapshot } from "../../../lib/ai/assistantConfig";
import { AI_MODULES } from "../../../features/configuracoes/aiSettingsTypes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AssistenteIrPage(): Promise<JSX.Element> {
  const db = createSupabaseServerClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: profile } = await db.from("profiles")
    .select("role,active").eq("id", user.id).maybeSingle();
  if (!profile?.active || profile.role !== "owner") redirect("/sistema?acesso=negado");
  const state = await loadAssistantOwnerSnapshot();
  const enabledModules = AI_MODULES.filter((item) => state.modes[item.key] !== "off")
    .map((item) => item.label);

  return (
    <>
      <ModuleHeader eyebrow="SISTEMA / INTELIGÊNCIA ARTIFICIAL"
        title="Assistente IR" description="Converse com a IA usando os módulos autorizados, sem permitir execuções automáticas."
        action={<Link className="btn btn-secondary" href="/sistema/configuracoes/assistente-ir">Configurar IA</Link>} />
      <AiAssistantChatPanel enabled={state.enabled && state.backendAvailable && state.encryptionAvailable}
        modules={enabledModules} />
    </>
  );
}
