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
    const fields = item.coverage.teamMode
      ? item.coverage.members.flatMap(m => m.tasks)
      : null;
    const fieldDone = fields
      ? fields.every(t => Boolean(t.completedAt))
      : item.coverage.taskStatus === "completed";
    if (item.coverage.articleStatus === "completed" && fieldDone) return "completed";
    if (item.coverage.articleStatus === "completed" ||
        (fields ? fields.some(t => Boolean(t.completedAt))
          : item.coverage.taskStatus === "completed")) return "in_progress";
    return "pending";
  }
  if (item.status === "completed") return "completed";
  if (item.assignees.some(person => person.completedAt)) return "in_progress";
  return "pending";
}

/** Lista todos os colaboradores vinculados à matéria, sem repetir pessoas. */
export function getTvResponsibleNames(
 item:WeeklyPautaItem, names:ReadonlyMap<string,string>,
):string {
 const people=new Map<string,string>();
 const put=(id:string|null|undefined, fallback?:string|null)=>{
   if(!id)return;
   const name=names.get(id)??fallback;
   if(name?.trim()&&!people.has(id))people.set(id,name.trim());
 };
 // A Pauta simples tem vários responsáveis; a cobertura traz titulares e equipe.
 for(const person of item.assignees)put(person.id,person.name);
 if(item.coverage){
   put(item.coverage.articleOwnerId);
   put(item.coverage.attendanceOwnerId);
   for(const person of item.coverage.members)put(person.profileId);
 }
 put(item.responsibleProfileId,item.responsibleName);
 return [...people.values()].join(" · ") || item.responsibleName || "Equipe";
}

export function toTvPautaSnapshot(
  data: Pick<AgendaWorkspaceData,"weekStart"|"periodStart"|"periodEnd"|"pautaItems"|"profiles">,
  generatedAt: string = new Date().toISOString(),
): TvPautaSnapshot {
  const name = new Map(data.profiles.map(profile => [profile.id,profile.name]));
  const cards: TvPautaCard[] = data.pautaItems.filter(item => !(item.workflow?.workflowKind === "article" && item.status === "cancelled")).map(item => {
    const status = deriveTvPautaStatus(item);
    const coverage = item.coverage;
    const articleName = coverage ? name.get(coverage.articleOwnerId) ?? "Redação" : null;
    const fieldName = coverage ? name.get(coverage.attendanceOwnerId) ?? "Cobertura" : null;
    const teamPending = coverage?.teamMode
      ? coverage.members.flatMap(person =>
        person.tasks.filter(task=>!task.completedAt)
        .map(task=>task.label+": "+(name.get(person.profileId)??"Colaborador")))
      : [];
    const detail = coverage?.teamMode
      ? [
        coverage.articleStatus==="completed" ? null : "Matéria: "+articleName,
        ...teamPending,
      ].filter(Boolean).join(" · ") || "Entregas concluídas"
      : coverage
        ? coverage.articleStatus !== "completed"
          ? "Matéria: "+articleName+(coverage.taskStatus !== "completed"
             ? " · "+coverage.taskLabel+": "+fieldName : "")
          : coverage.taskStatus !== "completed"
            ? coverage.taskLabel+": "+fieldName
            : "Entregas concluídas"
        : item.assignees.filter(person => !person.completedAt).map(person => person.name).join(" · ")
          || (status === "completed" ? "Concluída" : "Aguardando responsável");
    return {
      id: item.id,
      title: item.title,
      responsible: getTvResponsibleNames(item,name),
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

/** Ajusta a capacidade da TV à quantidade de nomes, evitando cortar a equipe. */
export function tvPautaMinRowPx(cards:readonly TvPautaCard[],width:number):number {
 const availableWidth=Math.max(140,width-130);
 const charsPerLine=Math.max(18,Math.floor(availableWidth/7));
 let required=72;
 for(const card of cards){
   const nameLines=Math.max(1,Math.ceil(card.responsible.length/charsPerLine));
   const titleLines=Math.max(1,Math.min(2,Math.ceil(card.title.length/(charsPerLine+8))));
   const needed=72+16*(nameLines-1)+16*(titleLines-1);
   required=Math.max(required,needed);
 }
 return Math.min(220,required);
}

/** Cada cartão cresce para preencher a altura. Só paginar se não houver leitura confortável. */
export function calculateTvPagination(
  height:number,items:number,minRowPx:number=70,gapPx:number=8,
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
