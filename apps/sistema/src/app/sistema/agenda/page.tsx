import Link from "next/link";
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
  let initialView: "agenda" | "pauta" = one(searchParams?.view) === "pauta" ? "pauta" : "agenda";
  const data = await loadAgendaWorkspaceData(focusDate);
  if (initialView === "agenda" && !data.access.agendaRead) initialView = "pauta";
  if (initialView === "pauta" && !data.access.pautaRead) initialView = "agenda";

  return (
    <>
      <ModuleHeader
        eyebrow="REDAÇÃO / ORGANIZAÇÃO"
        title="Agenda e pauta"
        description="Compromissos da equipe e pauta operacional da semana, no mesmo lugar."
        action={<Link className="header-action" href={"/agenda?view=" + initialView + "&date=" + focusDate}>Abrir modo agenda</Link>}
      />
      <AgendaWorkspace data={data} initialView={initialView} basePath="/sistema/agenda" />
    </>
  );
}
