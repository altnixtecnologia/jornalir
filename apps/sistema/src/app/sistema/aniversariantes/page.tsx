import { redirect } from "next/navigation";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { BirthdaysList } from "../../../features/aniversariantes/BirthdaysList";
import { ClientBirthdayDirectory, type BirthdayClientRow } from "../../../features/aniversariantes/ClientBirthdayDirectory";
import { isLocalPreviewEnabled } from "../../../lib/auth/localPreview";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { currentBirthdayWeekISO } from "../../../features/aniversariantes/birthdayWeek";
import { EditorialBirthdayPanel } from "../../../features/aniversariantes/EditorialBirthdayPanel";
import type {
  EditorialBirthdayRow, EditorialBirthdayMessage,
} from "../../../features/aniversariantes/editorialBirthdayTypes";

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

  const weekStart = currentBirthdayWeekISO();
  const [entriesResult, messagesResult] = await Promise.all([
    db.from("birthday_entries")
      .select("id,origin,source_client_id,group_client_id,display_name,birth_month,birth_day,birth_year,city,relationship,profession,organization,known_as,message_context,notes,active,publish_in_print")
      .order("display_name",{ascending:true}),
    db.from("birthday_edition_messages")
      .select("birthday_entry_id,edition_week_start,message,family,opening,ending")
      .eq("edition_week_start",weekStart),
  ]);
  const editorialReady = !entriesResult.error && !messagesResult.error;
  const entries = (entriesResult.data || []) as EditorialBirthdayRow[];
  const messages = (messagesResult.data || []) as EditorialBirthdayMessage[];

  return (
    <>
      <ModuleHeader eyebrow="ANIVERSARIANTES" title="Aniversariantes"
        description="Cadastros de pessoas e empresas vinculados ao módulo editorial." />
      {error ? (
        <section className="form-section">
          <p className="form-error" role="alert">Não foi possível consultar os cadastros. Tente novamente.</p>
        </section>
      ) : (
        <>
          <ClientBirthdayDirectory clients={clients} />
          {editorialReady ? (
            <EditorialBirthdayPanel clients={clients} entries={entries}
              initialMessages={messages} weekStart={weekStart} />
          ) : (
            <section className="form-section">
              <p className="form-error" role="alert">Não foi possível acessar os registros editoriais. Nenhum dado foi modificado; verifique a configuração do banco e tente novamente.</p>
            </section>
          )}
        </>
      )}
    </>
  );
}
