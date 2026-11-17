import type { AgendaEventItem } from "./agendaTypes";

/** Fonte visual de conclusão. Uma baixa individual pendente não reabre
 * um evento já encerrado pela equipe. Nunca grava dados. */
export function agendaEventState(event: Pick<AgendaEventItem,"status"|"completedAt"|"workflowClosedAt">): AgendaEventItem["status"] {
  if (event.status === "cancelled") return "cancelled";
  if (event.status === "completed" || event.completedAt || event.workflowClosedAt) return "completed";
  return "scheduled";
}

export function agendaDayCounts(events: readonly Pick<AgendaEventItem,
  "status"|"completedAt"|"workflowClosedAt"|"showInAgenda">[]): {open:number;completed:number} {
  let open=0,completed=0;
  for (const event of events) {
    if (!event.showInAgenda) continue;
    const status=agendaEventState(event);
    if(status==="scheduled")open++;
    if(status==="completed")completed++;
  }
  return {open,completed};
}

export function agendaMonthCounts(events: readonly Pick<AgendaEventItem,
  "eventDate"|"status"|"completedAt"|"workflowClosedAt"|"showInAgenda">[],
  start:string,end:string):{open:number;completed:number}{
  return agendaDayCounts(events.filter(event=>event.eventDate>=start&&event.eventDate<=end));
}
