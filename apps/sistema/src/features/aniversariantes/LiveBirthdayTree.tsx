"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { BirthdayEntry, BirthdayGroup } from "./birthdayTypes";
import {
  dayIndexWithinRange, formatBirthDateShort, formatDateShort,
  getNewspaperWeekRange, getMonthRange, isBirthdayWithinRange, listNewspaperWeekDays,
  matchesDay, weekdayAbbr, weekdayFull, shiftWeeks,
} from "./birthdayTypes";
import type { EditorialBirthdayMessage } from "./editorialBirthdayTypes";
import { NewBirthdayForm } from "./NewBirthdayForm";
import { prepareBirthdayEditionMessage, setBirthdayPublication } from "../../app/sistema/aniversariantes/actions";
import { extractSafeEditorialPhrase,formatEditorialDayLabel,generateBirthdayMessage } from "./messageGenerator";
import styles from "./LiveBirthdayTree.module.css";

type Period = "all"|"newspaper"|"today"|"month"|"custom";
function keyFromDDMM(value:string):number|null {
  const digits=value.trim().replace(/\D/g,"");
  if(digits.length!==4)return null;
  const d=Number(digits.slice(0,2)),m=Number(digits.slice(2,4));
  const check=new Date(Date.UTC(2000,m-1,d));
  return d>0&&m>0&&check.getUTCDate()===d&&check.getUTCMonth()+1===m?m*100+d:null;
}
function birthdayKey(iso:string):number{
  return Number(iso.slice(5,7))*100+Number(iso.slice(8,10));
}
function inDDMMRange(birthday:number,start:number,end:number):boolean {
  return start<=end?birthday>=start&&birthday<=end:birthday>=start||birthday<=end;
}
function dateOnly(iso:string):Date{return new Date(iso+"T12:00:00");}
function dateISO(d:Date):string{return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}

export function LiveBirthdayTree({groups,messages,initialWeekStart,todayISO}:{
  groups:BirthdayGroup[];messages:EditorialBirthdayMessage[];
  initialWeekStart:string;todayISO:string;
}): JSX.Element {
  const router=useRouter();
  const [pendingId,setPendingId]=useState<string|null>(null);
  const [feedback,setFeedback]=useState<string|null>(null);
  const [issue,setIssue]=useState<string|null>(null);
  const [publishOverrides,setPublishOverrides]=useState<Record<string,boolean>>({});
  const [localMessages,setLocalMessages]=useState<Record<string,EditorialBirthdayMessage>>({});
  const [open,setOpen]=useState<Set<string>>(()=>new Set(groups.map(g=>g.id)));
  const [newGroup,setNewGroup]=useState<string|null|undefined>(undefined);
  const [period,setPeriod]=useState<Period>("newspaper");
  const [week,setWeek]=useState(()=>dateOnly(initialWeekStart));
  const [selectedDay,setSelectedDay]=useState<string|null>(null);
  const [search,setSearch]=useState("");
  const [city,setCity]=useState("all");
  const [origin,setOrigin]=useState("all");
  const [publication,setPublication]=useState("all");
  const [from,setFrom]=useState("");
  const [to,setTo]=useState("");
  const weeks=useMemo(()=>getNewspaperWeekRange(week),[week]);
  const weekDays=useMemo(()=>listNewspaperWeekDays(weeks),[weeks]);
  const cityOptions=useMemo(()=>{
    const values=new Set<string>();
    groups.forEach(g=>{
      if(g.city)values.add(g.city);
      if(g.principal?.city)values.add(g.principal.city);
      g.members.forEach(m=>{if(m.city)values.add(m.city)});
    });
    return [...values].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  },[groups]);
  const today=useMemo(()=>dateOnly(todayISO),[todayISO]);
  const searchedKey=keyFromDDMM(search);
  const startKey=keyFromDDMM(from),endKey=keyFromDDMM(to);
  const searchInvalid=Boolean(search.trim()&&searchedKey===null);
  const customInvalid=period==="custom"&&Boolean((from.trim()&&startKey===null)||(to.trim()&&endKey===null));
  const range=useMemo(()=>{
    if(period==="newspaper")return weeks;
    if(period==="today")return {start:today,end:today};
    if(period==="month")return getMonthRange(today);
    return null;
  },[period,weeks,today]);
  function baseMatch(entry:BirthdayEntry):boolean{
    return entry.active&&
      (city==="all"||entry.city===city)&&
      (origin==="all"||entry.origin===origin)&&
      (publication==="all"||isPublished(entry)===(publication==="yes"))&&
      (!search.trim()||searchedKey===birthdayKey(entry.birthDate));
  }
  function include(entry:BirthdayEntry):boolean{
    if(!baseMatch(entry))return false;
    if(period==="all")return true;
    if(period==="custom"){
      return startKey!==null&&endKey!==null&&inDDMMRange(birthdayKey(entry.birthDate),startKey,endKey);
    }
    if(selectedDay&&period==="newspaper")return matchesDay(entry.birthDate,dateOnly(selectedDay));
    return Boolean(range&&isBirthdayWithinRange(entry.birthDate,range.start,range.end));
  }
  function indexInPeriod(entry:BirthdayEntry):number{
    if(range){
      const index=dayIndexWithinRange(entry.birthDate,range.start,range.end);
      if(index!==null)return index;
    }
    if(period==="custom"&&startKey!==null){
      const key=birthdayKey(entry.birthDate);
      return key>=startKey?key-startKey:key+1231-startKey;
    }
    return birthdayKey(entry.birthDate);
  }
  const matching=useMemo(()=>{
    const result:Array<{group:BirthdayGroup;entry:BirthdayEntry}>=[];
    groups.forEach(g=>{
      if(g.principal&&include(g.principal))result.push({group:g,entry:g.principal});
      g.members.filter(m=>include(m)).forEach(entry=>result.push({group:g,entry}));
    });
    return result.sort((a,b)=>indexInPeriod(a.entry)-indexInPeriod(b.entry)||
      a.entry.displayName.localeCompare(b.entry.displayName,"pt-BR"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[groups,search,city,origin,publication,period,range,selectedDay,startKey,endKey]);
  const visible=useMemo(()=>{
    const first=new Map<string,number>();
    matching.forEach(({group,entry})=>first.set(group.id,Math.min(first.get(group.id)??Infinity,indexInPeriod(entry))));
    return groups.filter(g=>first.has(g.id)).sort((a,b)=>
      (first.get(a.id)??Infinity)-(first.get(b.id)??Infinity)||a.label.localeCompare(b.label,"pt-BR"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[groups,matching,range,period,startKey]);
  const weekMessages=useMemo(()=>new Map(messages.map(m=>[m.birthday_entry_id,m])),[messages]);
  const isCurrentWeek= dateISO(weeks.start)===initialWeekStart;
  const usedMessageTexts=useMemo(()=>new Set(messages.map(m=>m.message)),[messages]);
  function isPublished(entry:BirthdayEntry):boolean {
    return publishOverrides[entry.id]??entry.publishInPrint;
  }
  async function togglePublication(entry:BirthdayEntry):Promise<void> {
    if(pendingId)return;
    setPendingId(entry.id);setIssue(null);setFeedback(null);
    const next=!isPublished(entry);
    try {
      const result=await setBirthdayPublication(entry.origin==="cadastro"?"cliente":"editorial",entry.id,next);
      if("error" in result){setIssue(result.error);return;}
      setPublishOverrides(previous=>({...previous,[entry.id]:result.data.published}));
      setFeedback(result.data.published?"Publicação autorizada.":"Publicação desativada.");
      router.refresh();
    } catch {setIssue("Não foi possível alterar a autorização. Tente novamente.");}
    finally {setPendingId(null);}
  }
  async function saveMessage(entry:BirthdayEntry,regenerate:boolean):Promise<void> {
    if(pendingId)return;
    setPendingId(entry.id);setIssue(null);setFeedback(null);
    try {
      const result=await prepareBirthdayEditionMessage(
        entry.origin==="cadastro"?"cliente":"editorial",entry.id,regenerate
      );
      if("error" in result){setIssue(result.error);return;}
      setLocalMessages(previous=>({...previous,[entry.id]:result.data}));
      setFeedback("Mensagem salva na edição atual.");
      router.refresh();
    } catch {setIssue("Não foi possível salvar a mensagem. Tente novamente.");}
    finally {setPendingId(null);}
  }
  function suggestMessage(entry:BirthdayEntry):string|null {
    if(!isCurrentWeek)return null;
    const day=weekDays.find(day=>matchesDay(entry.birthDate,day));
    if(!day)return null;
    const result=generateBirthdayMessage({
      name:entry.displayName,city:entry.city||undefined,
      profession:entry.profession||undefined,organization:entry.organization||undefined,
      knownAs:entry.knownAs||undefined,
      editorialPhrase:extractSafeEditorialPhrase(entry.messageContext||""),
      dateLabel:formatEditorialDayLabel(weekdayFull(day),day),
    },usedMessageTexts,{family:{},opening:{},ending:{}},{},
    `${initialWeekStart}::${entry.id}::preview`);
    return result.text;
  }
  function toggle(id:string):void{setOpen(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});}
  function clear():void{
    setSearch("");setPeriod("newspaper");setWeek(dateOnly(initialWeekStart));
    setCity("all");setOrigin("all");setPublication("all");setFrom("");setTo("");setSelectedDay(null);
  }
  function openManagement():void{
    const el=document.getElementById("aniv-gerenciar") as HTMLDetailsElement|null;
    if(el){el.open=true;el.scrollIntoView({behavior:"smooth",block:"start"});}
  }
  function entryView(e:BirthdayEntry):JSX.Element{
    const stored=localMessages[e.id]||weekMessages.get(e.id);
    const preview=period==="newspaper"&&!stored?suggestMessage(e):null;
    const published=isPublished(e);
    const waiting=pendingId===e.id;
    return <div key={e.id} className="aniv-entry" style={{padding:10}}>
      <div className={styles.personHeader}>
        <div className="aniv-entry-main">
          <span className="aniv-entry-name">{e.displayName}</span>
          {e.relationship?<span className="aniv-entry-relationship">{e.relationship}</span>:null}
          <span className="aniv-entry-date">{formatBirthDateShort(e.birthDate)}</span>
          <span className="aniv-entry-city">{e.city||"—"}</span>
          <span className="cadastro-role-badge">{e.origin==="cadastro"?"Cadastro":e.origin==="familiar"?"Familiar":"Excepcional"}</span>
          <span className={`status-pill ${published?"status-pill--published":"status-pill--draft"}`}>
            {published?"Publicação autorizada":"Não publica"}
          </span>
        </div>
        <div className={`aniv-entry-row-actions no-print ${styles.personActions}`}>
          <button type="button" className="cadastros-btn-secondary"
            aria-pressed={published} disabled={Boolean(pendingId)} onClick={()=>void togglePublication(e)}>
            {waiting?"Salvando...":published?"Desativar publicação":"Autorizar publicação"}
          </button>
          {e.origin==="cadastro"?
            <Link className="cadastros-btn-secondary" href={`/sistema/clientes/${e.id}/editar`}>Editar nascimento</Link>:
            <button type="button" className="cadastros-btn-secondary" onClick={openManagement}>Editar cadastro editorial</button>}
        </div>
      </div>
      {period==="newspaper"&&isCurrentWeek&&(stored||preview)?<div className={styles.message}>
        <div className={styles.messageHeader}>
          <strong>{stored?"Mensagem da edição":"Sugestão de mensagem · não salva"}</strong>
          <div className={`no-print ${styles.messageActions}`}>
            <button className="cadastros-btn-secondary" type="button" disabled={Boolean(pendingId)}
              onClick={()=>void saveMessage(e,Boolean(stored))}>
              {waiting?"Salvando...":stored?"Trocar mensagem":"Salvar mensagem"}
            </button>
          </div>
        </div>
        <p className={styles.messageText}>{stored?.message||preview}</p>
        {!published?<small className={styles.unpublishedNote}>Prévia editorial. Este aniversariante não está autorizado para publicação.</small>:null}
      </div>:null}
    </div>;
  }
  return <div className={`aniv-module ${styles.root}`}>
    {issue?<p className="form-error" role="alert">{issue}</p>:null}
    {feedback?<p className="helper-text" role="status">{feedback}</p>:null}
    <div className={`aniv-header-row no-print ${styles.header}`}>
      <button className="cadastros-btn-primary" type="button" onClick={()=>setNewGroup(null)}>
        + Novo aniversariante
      </button>
    </div>
    {newGroup!==undefined && <div id="aniv-new-birthday"><NewBirthdayForm key={newGroup??"manual"} groups={groups}
      linkedId={newGroup} onClose={()=>setNewGroup(undefined)} /></div>}
    <div className={`aniv-week-cta-row no-print ${styles.weekHeader}`}>
      <button type="button" className={`aniv-week-cta${period==="newspaper"?" is-active":""}`}
        onClick={()=>{setPeriod("newspaper");setSelectedDay(null)}}>
        <strong>SEMANA DO JORNAL</strong>
        <span>{formatDateShort(weeks.start)} → {formatDateShort(weeks.end)}</span>
      </button>
      {period==="newspaper"?<div className="aniv-week-nav">
        <button className="cadastros-btn-secondary" type="button" onClick={()=>{setWeek(x=>shiftWeeks(x,-1));setSelectedDay(null)}}>‹ Semana anterior</button>
        <button className="cadastros-btn-secondary" type="button" onClick={()=>{setWeek(dateOnly(initialWeekStart));setSelectedDay(null)}}>Semana atual</button>
        <button className="cadastros-btn-secondary" type="button" onClick={()=>{setWeek(x=>shiftWeeks(x,1));setSelectedDay(null)}}>Próxima semana ›</button>
      </div>:null}
    </div>
    {period==="newspaper"?<div className={`aniv-week-strip no-print ${styles.weekStrip}`}>
      {weekDays.map(day=>{
        const date=dateISO(day);
        const count=groups.reduce((sum,g)=>{
          const people=[g.principal,...g.members].filter((x):x is BirthdayEntry=>Boolean(x));
          return sum+people.filter(e=>baseMatch(e)&&matchesDay(e.birthDate,day)).length;
        },0);
        return <button key={date} type="button" className={`aniv-day-cell${count?" has-entries":""}${selectedDay===date?" is-selected":""}`}
          onClick={()=>setSelectedDay(v=>v===date?null:date)} aria-pressed={selectedDay===date}>
          <span className="aniv-day-weekday">{weekdayAbbr(day)}</span>
          <span className="aniv-day-number">{String(day.getDate()).padStart(2,"0")}</span>
          <span className="aniv-day-count">{count}</span>
        </button>;
      })}
    </div>:null}
    <div className={`cadastros-filters-bar no-print ${styles.filters}`}>
      <label className={styles.dateFilter}><span>Buscar aniversário (DD/MM)</span>
        <input type="text" inputMode="numeric" maxLength={5} placeholder="Ex.: 01/07"
          aria-label="Buscar aniversário por dia e mês" aria-invalid={Boolean(search.trim()&&keyFromDDMM(search)===null)}
          value={search} onChange={e=>{
            const value=e.target.value.replace(/[^0-9/]/g,"").slice(0,5);
            setSearch(value);
            if(value.replace(/[^0-9]/g,"").length===4){setPeriod("all");setSelectedDay(null);}
          }}/>
      </label>
      <label className={styles.periodFilter}><span>Período</span>
        <select value={period} aria-label="Período" onChange={e=>{
          const value=e.target.value as Period;
          setPeriod(value);setSelectedDay(null);
          if(value==="newspaper")setWeek(dateOnly(initialWeekStart));
        }}>
          <option value="newspaper">Semana do jornal</option>
          <option value="today">Hoje</option>
          <option value="month">Este mês</option>
          <option value="all">Todos</option>
          <option value="custom">Personalizado</option>
        </select>
      </label>
      {period==="custom" && <>
        <label className={styles.smallDate}><span>De (DD/MM)</span>
          <input type="text" inputMode="numeric" maxLength={5} placeholder="28/12"
            aria-label="Início do período por dia e mês" value={from}
            onChange={e=>setFrom(e.target.value.replace(/[^0-9/]/g,"").slice(0,5))}/>
        </label>
        <label className={styles.smallDate}><span>Até (DD/MM)</span>
          <input type="text" inputMode="numeric" maxLength={5} placeholder="03/01"
            aria-label="Fim do período por dia e mês" value={to}
            onChange={e=>setTo(e.target.value.replace(/[^0-9/]/g,"").slice(0,5))}/>
        </label>
      </>}
      <label className={styles.extraFilter}><span>Cidade</span>
        <select value={city} aria-label="Cidade" onChange={e=>setCity(e.target.value)}>
          <option value="all">Todas</option>
          {cityOptions.map(x=><option value={x} key={x}>{x}</option>)}
        </select>
      </label>
      <label className={styles.extraFilter}><span>Publicação</span>
        <select value={publication} aria-label="Publicação" onChange={e=>setPublication(e.target.value)}>
          <option value="all">Todas</option><option value="yes">Publica no jornal</option><option value="no">Não publica</option>
        </select>
      </label>
      <label className={styles.extraFilter}><span>Origem</span>
        <select value={origin} aria-label="Origem" onChange={e=>setOrigin(e.target.value)}>
          <option value="all">Todas</option><option value="cadastro">Cadastro</option>
          <option value="familiar">Familiar</option><option value="manual">Excepcional</option>
        </select>
      </label>
      <div className={`cadastros-filters-actions ${styles.actions}`}>
        <button className="cadastros-btn-secondary" type="button" onClick={clear}>Limpar filtros</button>
        <button className="cadastros-btn-primary" type="button" onClick={()=>window.print()}>Gerar relatório</button>
      </div>
    </div>
    {Boolean(search.trim()&&keyFromDDMM(search)===null) ||
      Boolean(period==="custom"&&((from.trim()&&startKey===null)||(to.trim()&&endKey===null))) ?
      <p className={styles.validation} role="status">Informe datas válidas em DD/MM. O ano de nascimento não interfere nos filtros.</p> : null}
    <p className={`cadastros-count no-print ${styles.count}`}>{matching.length} aniversariante(s) em {visible.length} grupo(s).</p>
    <div className={`aniv-tree no-print ${styles.tree}`}>
      {visible.map(g=>{
        const expanded=open.has(g.id);
        const people=[g.principal,...g.members].filter((e):e is BirthdayEntry=>Boolean(e));
        const selected=people.filter(e=>include(e)).sort((a,b)=>indexInPeriod(a)-indexInPeriod(b));
        return <div className="aniv-group" key={g.id}>
          <div className={`aniv-group-header-row ${styles.groupHeader}`}>
            <button type="button" className={`aniv-group-header ${styles.groupButton}`} aria-expanded={expanded} onClick={()=>toggle(g.id)}>
              <span className="aniv-group-chevron" aria-hidden="true">{expanded?"▼":"▶"}</span>
              <span className="aniv-group-label">{g.label}</span>
              <span className="aniv-group-meta">{selected.length} aniversariante(s)</span>
              {g.kind==="company"?<span className="cadastro-kind-hint">Empresa / instituição</span>:null}
            </button>
          </div>
          {expanded?<div className={`aniv-group-body ${styles.groupBody}`}>
            {selected.map(entryView)}
            <button className="cadastros-btn-secondary no-print" type="button"
              onClick={()=>{
                setNewGroup(/^[a-f0-9-]{36}$/i.test(g.id)?g.id:null);
                document.getElementById("aniv-new-birthday")?.scrollIntoView({behavior:"smooth",block:"start"});
              }}>
              + Vincular pessoa
            </button>
          </div>:null}
        </div>;
      })}
      {!visible.length?<p className="helper-text" role="status">Nenhum aniversário {period==="newspaper" ? "nesta semana" : period==="today" ? "hoje" : period==="month" ? "neste mês" : "para os filtros selecionados"}.</p>:null}
    </div>
    <div className="aniv-print-report">
      <h1>ANIVERSARIANTES</h1>
      <p className="aniv-print-period">{period==="all"?"Todos os aniversariantes":period==="newspaper"?`Semana: ${formatDateShort(weeks.start)} a ${formatDateShort(weeks.end)}`:"Período selecionado"}</p>
      <ul>{matching.filter(({entry})=>isPublished(entry)).map(({entry})=>
        <li key={entry.id}>
          <strong>{entry.displayName}</strong> — {formatBirthDateShort(entry.birthDate)} {entry.city?"· "+entry.city:""}
          {(localMessages[entry.id]||weekMessages.get(entry.id))?.message?
            <p>{(localMessages[entry.id]||weekMessages.get(entry.id))?.message}</p>:null}
        </li>)}</ul>
      <p className="aniv-print-total">Total autorizado: {matching.filter(({entry})=>isPublished(entry)).length}</p>
    </div>
  </div>;
}
