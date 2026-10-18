import { redirect } from "next/navigation";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { AvisosGeraisPanel } from "../../../../features/publicidade/AvisosGeraisPanel";
import { isCommercialPushSendEnabled, listCommercialAnnouncements } from "./actions";

export const dynamic = "force-dynamic";

export default async function AvisosGeraisPage(): Promise<JSX.Element> {
  const client = createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await client.from("profiles").select("role,active").eq("id", user.id).maybeSingle();
  if (!profile?.active || !["owner", "admin"].includes(profile.role)) redirect("/sistema");

  const [result, sendEnabled] = await Promise.all([
    listCommercialAnnouncements(),
    isCommercialPushSendEnabled(),
  ]);
  const history = "ok" in result ? result.data : [];

  return (
    <>
      <ModuleHeader
        eyebrow="COMERCIAL"
        title="Avisos gerais"
        description="Mensagens institucionais/comerciais, via push, para leitores do site e do aplicativo que autorizaram esta categoria — separado das notícias normais/urgentes."
      />
      <AvisosGeraisPanel initialHistory={history} initialError={"error" in result ? result.error : null} sendEnabled={sendEnabled} />
    </>
  );
}
