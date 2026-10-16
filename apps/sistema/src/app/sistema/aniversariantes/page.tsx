import { redirect } from "next/navigation";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { BirthdaysList } from "../../../features/aniversariantes/BirthdaysList";
import { ClientBirthdayDirectory, type BirthdayClientRow } from "../../../features/aniversariantes/ClientBirthdayDirectory";
import { isLocalPreviewEnabled } from "../../../lib/auth/localPreview";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AniversariantesPage(): Promise<JSX.Element> {
  const localPreview = isLocalPreviewEnabled();
  if (localPreview) {
    return (
      <>
        <ModuleHeader eyebrow="ANIVERSARIANTES" title="Aniversariantes"
          description="Agenda editorial de quinta-feira a quarta-feira." />
        <BirthdaysList localPreview />
      </>
    );
  }

  const db = createSupabaseServerClient();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) redirect("/login");
  const { data: profile } = await db.from("profiles")
    .select("role,active").eq("id", auth.user.id).maybeSingle();
  if (!profile?.active) redirect("/login");
  if (profile.role === "operator") {
    const { data: allowed, error } = await db.rpc("staff_can_see_module", { p_module: "aniversariantes" });
    if (error || allowed !== true) redirect("/sistema?acesso=negado");
  }
  const { data, error } = await db.from("clients")
    .select("id,kind,status,full_name,company_name,trade_name,birth_date,address_city")
    .eq("status", "active").order("created_at", { ascending: false });
  const clients: BirthdayClientRow[] = (data ?? []).map((client) => ({
    id: client.id,
    kind: client.kind === "company" ? "company" : "individual",
    name: client.kind === "company"
      ? (client.trade_name || client.company_name || "(sem nome)")
      : (client.full_name || "(sem nome)"),
    city: client.address_city || "",
    birthDate: client.kind === "individual" ? (client.birth_date || null) : null,
  }));

  return (
    <>
      <ModuleHeader eyebrow="ANIVERSARIANTES" title="Aniversariantes"
        description="Cadastros de pessoas e empresas vinculados ao módulo editorial." />
      {error ? (
        <section className="form-section">
          <p className="form-error" role="alert">Não foi possível consultar os cadastros. Tente novamente.</p>
        </section>
      ) : (
        <ClientBirthdayDirectory clients={clients} />
      )}
    </>
  );
}
