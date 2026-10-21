import { redirect } from "next/navigation";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { AgendaWorkspace } from "../../../features/agenda/AgendaWorkspace";
import { loadAgendaWorkspaceData, normalizeAgendaDate } from "../../../features/agenda/agendaData";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const focusDate = normalizeAgendaDate(one(searchParams?.date));
  const data = await loadAgendaWorkspaceData(focusDate);

  // Links antigos (?view=pauta) continuam funcionando, mas cada seção possui
  // sua própria rota para destacar corretamente a navegação inferior.
  if (one(searchParams?.view) === "pauta" && data.access.pautaRead) {
    redirect("/sistema/pauta?date=" + focusDate);
  }
  if (!data.access.agendaRead) {
    redirect("/sistema/pauta?date=" + focusDate);
  }

  return (
    <div className="agenda-mobile-page">
      <ModuleHeader
        eyebrow="REDAÇÃO / ORGANIZAÇÃO"
        title="Agenda"
        description="Compromissos da equipe em um só lugar."
      />
      <AgendaWorkspace data={data} initialView="agenda" basePath="/sistema/agenda" />
    </div>
  );
}
