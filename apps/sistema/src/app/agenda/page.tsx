import { AgendaWorkspace } from "../../features/agenda/AgendaWorkspace";
import { loadAgendaWorkspaceData, normalizeAgendaDate } from "../../features/agenda/agendaData";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AgendaStandalonePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const focusDate = normalizeAgendaDate(one(searchParams?.date));
  const initialView = one(searchParams?.view) === "pauta" ? "pauta" : "agenda";
  const data = await loadAgendaWorkspaceData(focusDate);

  return (
    <div className="agenda-standalone-page">
      <div className="agenda-standalone-intro">
        <div><p className="eyebrow">JORNALIR EQUIPE</p><h1>Agenda e pauta</h1></div>
        <span>Ambiente rápido para celular e rotina da redação.</span>
      </div>
      <AgendaWorkspace data={data} initialView={initialView} basePath="/agenda" />
    </div>
  );
}
