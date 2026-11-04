import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { WhatsappCaseBoard } from "../../../features/whatsapp/WhatsappCaseBoard";
import type { WhatsappCase, WhatsappStaffOption } from "../../../features/whatsapp/whatsappTypes";

export default async function WhatsappAtendimentoPage(): Promise<JSX.Element> {
  const db = createSupabaseServerClient();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) redirect("/login");
  const { data: profile } = await db.from("profiles").select("role,active").eq("id", auth.user.id).maybeSingle();
  if (!profile?.active) redirect("/login");
  if (profile.role === "operator") {
    const { data, error } = await db.rpc("staff_can_see_module", { p_module: "whatsapp" });
    if (error || data !== true) redirect("/sistema?acesso=negado");
  } else if (profile.role !== "owner" && profile.role !== "admin") {
    redirect("/sistema?acesso=negado");
  }

  const [casesResult, staffResult] = await Promise.all([
    db.from("whatsapp_attendance_cases")
      .select("id,contact_name,contact_phone,status,assigned_to,notes,created_at,updated_at,assignee:profiles(name)")
      .order("updated_at", { ascending: false }),
    db.from("profiles").select("id,name").eq("active", true).order("name"),
  ]);

  const cases: WhatsappCase[] = (casesResult.data ?? []).map((row: any) => ({
    id: row.id, contactName: row.contact_name, contactPhone: row.contact_phone,
    status: row.status, assignedTo: row.assigned_to, assignedToName: row.assignee?.name ?? null,
    notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
  const staff: WhatsappStaffOption[] = (staffResult.data ?? []).map((row: any) => ({ id: row.id, name: row.name }));

  return (
    <>
      <ModuleHeader
        eyebrow="WHATSAPP"
        title="Atendimento"
        description="Abra o WhatsApp de atendimento no navegador e use este painel só para organizar quem está atendendo cada conversa."
      />
      <WhatsappCaseBoard currentUserId={auth.user.id} cases={cases} staff={staff} />
    </>
  );
}
