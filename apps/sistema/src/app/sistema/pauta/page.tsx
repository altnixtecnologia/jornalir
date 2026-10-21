import { redirect } from "next/navigation";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { AgendaWorkspace } from "../../../features/agenda/AgendaWorkspace";
import { loadAgendaWorkspaceData, normalizeAgendaDate } from "../../../features/agenda/agendaData";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function PautaPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const focusDate = normalizeAgendaDate(one(searchParams?.date));
  const data = await loadAgendaWorkspaceData(focusDate);

  if (!data.access.pautaRead) {
    redirect("/sistema/agenda?date=" + focusDate);
  }

  return (
    <div className="agenda-mobile-page">
      <ModuleHeader
        eyebrow="REDAÇÃO / ORGANIZAÇÃO"
        title="Pauta da semana"
        description="Tarefas editoriais integradas à Agenda da equipe."
      />
      <AgendaWorkspace data={data} initialView="pauta" basePath="/sistema/agenda" />
    </div>
  );
}
