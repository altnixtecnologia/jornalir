import type { AgendaWorkspaceData, WeeklyPautaItem } from "../agenda/agendaTypes";

export interface TvPautaCard {
  id: string;
  title: string;
  responsible: string;
  detail: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  date: string | null;
}
export interface TvPautaSnapshot {
  weekStart: string;
  periodStart: string;
  periodEnd: string;
  cards: TvPautaCard[];
  total: number;
  completed: number;
  pending: number;
  generatedAt: string;
}

export function deriveTvPautaStatus(item: WeeklyPautaItem): TvPautaCard["status"] {
  if (item.status === "cancelled") return "cancelled";
  if (item.coverage) {
    // A Agenda confirma a participação; a Pauta só fecha após as entregas.
    const hasDeliverables = item.coverage.articleStatus === "completed" &&
      item.coverage.taskStatus === "completed";
    if (hasDeliverables) return "completed";
    if (item.coverage.taskStatus === "completed" ||
        item.coverage.articleStatus === "completed") return "in_progress";
    return "pending";
  }
  if (item.status === "completed") return "completed";
  if (item.assignees.some(person => person.completedAt)) return "in_progress";
  return "pending";
}

export function toTvPautaSnapshot(
  data: Pick<AgendaWorkspaceData,"weekStart"|"periodStart"|"periodEnd"|"pautaItems"|"profiles">,
  generatedAt: string = new Date().toISOString(),
): TvPautaSnapshot {
  const name = new Map(data.profiles.map(profile => [profile.id,profile.name]));
  const cards: TvPautaCard[] = data.pautaItems.map(item => {
    const status = deriveTvPautaStatus(item);
    const coverage = item.coverage;
    const articleName = coverage ? name.get(coverage.articleOwnerId) ?? "Redação" : null;
    const fieldName = coverage ? name.get(coverage.attendanceOwnerId) ?? "Cobertura" : null;
    const detail = coverage
      ? coverage.articleStatus !== "completed"
        ? "Matéria: "+articleName+(coverage.taskStatus !== "completed" ? " · "+coverage.taskLabel+": "+fieldName : "")
        : coverage.taskStatus !== "completed"
          ? coverage.taskLabel+": "+fieldName
          : "Entregas concluídas"
      : item.assignees.filter(person => !person.completedAt).map(person => person.name).join(" · ")
        || (status === "completed" ? "Concluída" : "Aguardando responsável");
    return {
      id: item.id,
      title: item.title,
      responsible: articleName || item.responsibleName || "Equipe",
      detail,
      date: item.dueDate,
      status,
    };
  });
  // Pendentes primeiro; em seguida, em andamento, concluídas e canceladas.
  const rank:Record<TvPautaCard["status"],number> = {
    in_progress:0,pending:1,completed:2,cancelled:3,
  };
  cards.sort((a,b) => rank[a.status]-rank[b.status] ||
    (a.date??"9999").localeCompare(b.date??"9999") ||
    a.title.localeCompare(b.title,"pt-BR"));
  return {
    weekStart:data.weekStart,
    periodStart:data.periodStart,
    periodEnd:data.periodEnd,
    cards,
    total:cards.filter(item => item.status!=="cancelled").length,
    completed:cards.filter(item => item.status==="completed").length,
    pending:cards.filter(item => item.status==="pending"||item.status==="in_progress").length,
    generatedAt,
  };
}

/** Cada cartão cresce para preencher a altura. Só paginar se não houver leitura confortável. */
export function calculateTvPagination(
  height:number,items:number,minRowPx:number=82,gapPx:number=8,
): {perPage:number;pages:number;rowPx:number} {
  if(items<=0)return {perPage:0,pages:1,rowPx:0};
  const safeHeight=Math.max(0,Math.floor(height));
  const capacity=Math.max(1,Math.floor((safeHeight+gapPx)/(minRowPx+gapPx)));
  const perPage=Math.min(items,capacity);
  return {
    perPage,
    pages:Math.ceil(items/perPage),
    rowPx:Math.max(0,Math.floor((safeHeight-Math.max(0,perPage-1)*gapPx)/perPage)),
  };
}
