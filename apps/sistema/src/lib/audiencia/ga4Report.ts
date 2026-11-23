export type AudiencePeriod = "today" | "yesterday" | "7d" | "30d" | "month";
export const AUDIENCE_PERIODS: ReadonlyArray<{value:AudiencePeriod;label:string}> = [
  {value:"today",label:"Hoje"}, {value:"yesterday",label:"Ontem"},
  {value:"7d",label:"7 dias"}, {value:"30d",label:"30 dias"},
  {value:"month",label:"Mês atual"},
];

export function asAudiencePeriod(input: string): AudiencePeriod {
  return AUDIENCE_PERIODS.some(p=>p.value===input) ? input as AudiencePeriod : "7d";
}
export function audienceDateRange(period: AudiencePeriod, today: string): {startDate:string;endDate:string} {
  if(period==="today") return {startDate:"today",endDate:"today"};
  if(period==="yesterday") return {startDate:"yesterday",endDate:"yesterday"};
  if(period==="30d") return {startDate:"29daysAgo",endDate:"today"};
  if(period==="month") return {startDate:today.slice(0,7)+"-01",endDate:"today"};
  return {startDate:"6daysAgo",endDate:"today"};
}
export interface GaRow {
  dimensionValues?: Array<{value?:string}>;
  metricValues?: Array<{value?:string}>;
}
export interface GaReport {rows?:GaRow[];}
export interface AudienceData {
  views:number;
  visitors:number;
  sessions:number;
  days:Array<{date:string;views:number}>;
  hours:Array<{hour:string;views:number}>;
  locations:Array<{place:string;users:number}>;
  articles:Array<{path:string;title:string;views:number}>;
}
function numeric(value:string|undefined):number {
  const n=Number(value??"0");
  return Number.isFinite(n)&&n>=0?n:0;
}
const dim=(r:GaRow,i:number)=>String(r.dimensionValues?.[i]?.value??"");
const metric=(r:GaRow,i:number)=>numeric(r.metricValues?.[i]?.value);
function safeArticlePath(path:string):boolean {
  return /^\/noticias\/[a-zA-Z0-9_%\-]+\/?$/.test(path) && !path.includes("%2f") && !path.includes("%2F");
}
export function parseAudienceReports(reports:GaReport[]):AudienceData {
  const stats=reports[0]?.rows?.[0];
  const days=(reports[1]?.rows??[]).map(row=>({date:dim(row,0),views:metric(row,0)}))
    .filter(row=>/^\d{8}$/.test(row.date)).sort((a,b)=>a.date.localeCompare(b.date));
  const hours=(reports[2]?.rows??[]).map(row=>({hour:dim(row,0).padStart(2,"0"),views:metric(row,0)}))
    .filter(row=>/^(?:0\d|1\d|2[0-3])$/.test(row.hour)).sort((a,b)=>a.hour.localeCompare(b.hour));
  const locations=(reports[3]?.rows??[]).map(row=>{
    const [country,region,city]=[dim(row,0),dim(row,1),dim(row,2)];
    const parts=[city,region,country].filter(v=>v && !v.startsWith("("));
    return {place:parts.join(" · ")||"Localização não informada",users:metric(row,0)};
  }).filter(row=>row.users>0).slice(0,12);
  const byPath=new Map<string,{path:string;title:string;views:number}>();
  for(const row of reports[4]?.rows??[]) {
    const path=dim(row,0);
    if(!safeArticlePath(path)) continue;
    const fromGa=dim(row,1).replace(/\s*\|\s*Informativo Regional\s*$/i,"").trim();
    const title=fromGa && fromGa!=="(not set)" ? fromGa.slice(0,220) : decodeURIComponent(path.split("/")[2]??"").replace(/-/g," ");
    const prev=byPath.get(path);
    byPath.set(path,{path,title:prev?.title||title,views:(prev?.views??0)+metric(row,0)});
  }
  const articles=[...byPath.values()].sort((a,b)=>b.views-a.views).slice(0,12);
  return {views:metric(stats??{},0),visitors:metric(stats??{},1),sessions:metric(stats??{},2),days,hours,locations,articles};
}
