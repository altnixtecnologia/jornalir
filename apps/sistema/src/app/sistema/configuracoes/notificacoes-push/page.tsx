import { redirect } from "next/navigation";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { EditorialPushSender } from "./EditorialPushSender";

export const dynamic = "force-dynamic";

export default async function PushEditorialPage(): Promise<JSX.Element> {
  const client = createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await client.from("profiles").select("role,active").eq("id", user.id).maybeSingle();
  if (!profile?.active || !["owner","admin"].includes(profile.role)) redirect("/sistema");
  return (
    <>
      <ModuleHeader eyebrow="CONFIGURAÇÕES" title="Notificações do Jornal IR" description="Prepare um aviso comum ou urgente para quem aceitou receber notificações." />
      <EditorialPushSender />
    </>
  );
}
