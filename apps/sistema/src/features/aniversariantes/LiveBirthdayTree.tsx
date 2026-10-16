"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { BirthdayEntry, BirthdayGroup } from "./birthdayTypes";
import {
  formatBirthDateShort, formatDateShort,
  getNewspaperWeekRange, getMonthRange, isBirthdayWithinRange, listNewspaperWeekDays,
  matchesDay, weekdayAbbr, shiftWeeks,
} from "./birthdayTypes";
import type { EditorialBirthdayMessage } from "./editorialBirthdayTypes";
import { NewBirthdayForm } from "./NewBirthdayForm";

type Period = "all"|"newspaper"|"today"|"month"|"custom";
export function LiveBirthdayTree({groups,messages}:{
  groups:BirthdayGroup[];messages:EditorialBirthdayMessage[];
}): JSX.Element {
  const [open,setOpen]=useState<Set<string>>(()=>new Set(groups.map(g=>g.id)));
  const [newGroup,setNewGroup]=useState<string|null|undefined>(undefined);
  const [period,setPeriod]=useState<Period>("all");
  const [week,setWeek]=useState(()=>new Date());
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
  const range=useMemo(()=>{
    if(period==="newspaper")return weeks;
    if(period==="today"){const start=new Date();start.setHours(0,0,0,0);return {start,end:new Date(start)};}
    if(period==="month")return getMonthRange(new Date());
    if(period==="custom"&&from&&to&&from<=to)return {start:new Date(from+"T00:00:00"),end:new Date(to+"T23:59:59")};
    return null;
  },[period,weeks,from,to]);
  const searchTerm=search.trim().toLocaleLowerCase("pt-BR");
  function include(entry:BirthdayEntry,group:BirthdayGroup):boolean{
    const nameMatch=!searchTerm||
      entry.displayName.toLocaleLowerCase("pt-BR").includes(searchTerm)||
      group.label.toLocaleLowerCase("pt-BR").includes(searchTerm);
    if(!nameMatch)return false;
    if(city!=="all"&&entry.city!==city)return false;
    if(origin!=="all"&&entry.origin!==origin)return false;
    if(publication!=="all"&&entry.publishInPrint!==(publication==="yes"))return false;
    if(period==="all")return true;
    if(selectedDay&&period==="newspaper")return matchesDay(entry.birthDate,new Date(selectedDay+"T12:00:00"));
    return Boolean(range&&isBirthdayWithinRange(entry.birthDate,range.start,range.end));
  }
  const matching=useMemo(()=>{
    const result:Array<{group:BirthdayGroup;entry:BirthdayEntry}>=[];
    groups.forEach(g=>{
      if(g.principal&&include(g.principal,g))result.push({group:g,entry:g.principal});
      g.members.filter(m=>include(m,g)).forEach(entry=>result.push({group:g,entry}));
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[groups,search,city,origin,publication,period,range,selectedDay]);
  const visible=useMemo(()=>{
    const ids=new Set(matching.map(x=>x.group.id));
    const groupsVisible=groups.filter(g=>ids.has(g.id)||
      (period==="all"&&city==="all"&&origin==="all"&&publication==="all"&&
       (!searchTerm||g.label.toLocaleLowerCase("pt-BR").includes(searchTerm))));
    return groupsVisible.sort((a,b)=>a.label.localeCompare(b.label,"pt-BR"));
  },[groups,matching,period,city,origin,publication,searchTerm]);
  const weekMessages=useMemo(()=>new Map(messages.map(m=>[m.birthday_entry_id,m])),[messages]);
  function toggle(id:string):void{setOpen(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});}
  function clear():void{setSearch("");setPeriod("all");setCity("all");setOrigin("all");setPublication("all");setFrom("");setTo("");setSelectedDay(null);}
  function entryView(e:BirthdayEntry):JSX.Element{
    const stored=weekMessages.get(e.id);
    return <div key={e.id} className="aniv-entry" style={{padding:10}}>
      <div className="aniv-entry-main">
        <span className="aniv-entry-name">{e.displayName}</span>
        {e.relationship?<span className="aniv-entry-relationship">{e.relationship}</span>:null}
        <span className="aniv-entry-date">{formatBirthDateShort(e.birthDate)}</span>
        <span className="aniv-entry-city">{e.city||"—"}</span>
        <span className="cadastro-role-badge">{e.origin==="cadastro"?"Cadastro":e.origin==="familiar"?"Familiar":"Extraordinário"}</span>
        {!e.active?<span className="status-pill status-pill--archived">Inativo</span>:null}
        <span className={`status-pill ${e.publishInPrint?"status-pill--published":"status-pill--draft"}`}>
          {e.publishInPrint?"Autorizado para publicação":"Não publica"}
        </span>
      </div>
      <div className="aniv-entry-row-actions no-print">
        {e.origin==="cadastro"?<Link className="cadastros-btn-secondary" href={`/sistema/clientes/${e.id}/editar`}>Editar nascimento</Link>:
          <a className="cadastros-btn-secondary" href="#aniv-gerenciar">Editar no gerenciamento</a>}
      </div>
      {period==="newspaper"&&stored?<div className="aniv-editorial">
        <p className="aniv-editorial-text"><strong>Mensagem salva:</strong> {stored.message}</p>
      </div>:null}
    </div>;
  }
  return <div className="aniv-module">
    <div className="aniv-header-row no-print">
      <button className="cadastros-btn-primary" type="button" onClick={()=>setNewGroup(null)}>
        + Novo aniversariante
      </button>
      <span className="helper-text">Cadastros vinculados e modelos de mensagens continuam disponíveis.</span>
    </div>
    {newGroup!==undefined && <NewBirthdayForm key={newGroup??"manual"} groups={groups}
      linkedId={newGroup} onClose={()=>setNewGroup(undefined)} />}
    <div className="aniv-week-cta-row no-print">
      <button type="button" className={`aniv-week-cta${period==="newspaper"?" is-active":""}`}
        onClick={()=>{setPeriod("newspaper");setSelectedDay(null)}}>
        <strong>SEMANA DO JORNAL</strong>
        <span>{formatDateShort(weeks.start)} → {formatDateShort(weeks.end)}</span>
      </button>
      {period==="newspaper"?<div className="aniv-week-nav">
        <button className="cadastros-btn-secondary" type="button" onClick={()=>{setWeek(x=>shiftWeeks(x,-1));setSelectedDay(null)}}>‹ Semana anterior</button>
        <button className="cadastros-btn-secondary" type="button" onClick={()=>{setWeek(new Date());setSelectedDay(null)}}>Semana atual</button>
        <button className="cadastros-btn-secondary" type="button" onClick={()=>{setWeek(x=>shiftWeeks(x,1));setSelectedDay(null)}}>Próxima semana ›</button>
      </div>:null}
    </div>
    {period==="newspaper"?<div className="aniv-week-strip no-print">
      {weekDays.map(day=>{
        const date=day.getFullYear()+"-"+String(day.getMonth()+1).padStart(2,"0")+"-"+String(day.getDate()).padStart(2,"0");
        const count=groups.flatMap(g=>[g.principal,...g.members].filter(Boolean) as BirthdayEntry[]).filter(e=>matchesDay(e.birthDate,day)).length;
        return <button key={date} type="button" className={`aniv-day-cell${count?" has-entries":""}${selectedDay===date?" is-selected":""}`}
          onClick={()=>setSelectedDay(v=>v===date?null:date)} aria-pressed={selectedDay===date}>
          <span className="aniv-day-weekday">{weekdayAbbr(day)}</span>
          <span className="aniv-day-number">{String(day.getDate()).padStart(2,"0")}</span>
          <span className="aniv-day-count">{count}</span>
        </button>;
      })}
    </div>:null}
    <div className="cadastros-filters-bar no-print">
      <label className="cadastros-search"><span className="sr-only">Buscar</span>
        <input type="search" placeholder="Buscar por nome ou instituição" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <select value={period} title="Período" aria-label="Período" onChange={e=>{setPeriod(e.target.value as Period);setSelectedDay(null)}}>
        <option value="all">Todos</option><option value="newspaper">Semana do jornal</option>
        <option value="today">Hoje</option><option value="month">Este mês</option>
        <option value="custom">Personalizado</option>
      </select>
      {period==="custom"?<>
        <input type="date" value={from} aria-label="De" onChange={e=>setFrom(e.target.value)}/>
        <input type="date" value={to} aria-label="Até" onChange={e=>setTo(e.target.value)}/>
      </>:null}
      <select value={city} aria-label="Cidade" onChange={e=>setCity(e.target.value)}>
        <option value="all">Cidade: todas</option>
        {cityOptions.map(x=><option value={x} key={x}>{x}</option>)}
      </select>
      <select value={publication} aria-label="Publicação" onChange={e=>setPublication(e.target.value)}>
        <option value="all">Publicação: todas</option><option value="yes">Publica no jornal</option><option value="no">Não publica</option>
      </select>
      <select value={origin} aria-label="Origem" onChange={e=>setOrigin(e.target.value)}>
        <option value="all">Origem: todas</option><option value="cadastro">Cadastro</option>
        <option value="familiar">Familiar</option><option value="manual">Excepcional</option>
      </select>
      <div className="cadastros-filters-actions">
        <button className="cadastros-btn-secondary" type="button" onClick={clear}>Limpar filtros</button>
        <button className="cadastros-btn-primary" type="button" onClick={()=>window.print()}>Gerar relatório</button>
      </div>
    </div>
    <p className="cadastros-count no-print">{matching.length} aniversariante(s) em {visible.length} grupo(s).</p>
    <div className="aniv-tree no-print">
      {visible.map(g=>{
        const expanded=open.has(g.id);
        const people=[g.principal,...g.members].filter((e):e is BirthdayEntry=>Boolean(e));
        const selected=people.filter(e=>include(e,g));
        return <div className="aniv-group" key={g.id}>
          <div className="aniv-group-header-row">
            <button type="button" className="aniv-group-header" aria-expanded={expanded} onClick={()=>toggle(g.id)}>
              <span className="aniv-group-chevron" aria-hidden="true">{expanded?"▼":"▶"}</span>
              <span className="aniv-group-label">{g.label}</span>
              {g.principal?<><span className="aniv-entry-date">{formatBirthDateShort(g.principal.birthDate)}</span>
                <span className="aniv-entry-city">{g.principal.city}</span></>:
                <span className="aniv-group-meta">{g.members.length} pessoa(s) vinculada(s)</span>}
              {g.kind==="company"?<span className="cadastro-kind-hint">Empresa / instituição</span>:null}
            </button>
          </div>
          {expanded?<div className="aniv-group-body">
            {selected.map(entryView)}
            {!selected.length?<p className="helper-text">Nenhuma pessoa neste período. Use Novo para vincular alguém.</p>:null}
            <button className="cadastros-btn-secondary no-print" type="button"
              onClick={()=>{
                setNewGroup(/^[a-f0-9-]{36}$/i.test(g.id)?g.id:null);
                window.scrollTo({top:0,behavior:"smooth"});
              }}>
              + Vincular pessoa
            </button>
          </div>:null}
        </div>;
      })}
      {!visible.length?<p className="helper-text">Nenhum resultado para os filtros selecionados.</p>:null}
    </div>
    <div className="aniv-print-report">
      <h1>ANIVERSARIANTES</h1>
      <p className="aniv-print-period">{period==="all"?"Todos os aniversariantes":period==="newspaper"?`Semana: ${formatDateShort(weeks.start)} a ${formatDateShort(weeks.end)}`:"Período selecionado"}</p>
      <ul>{matching.map(({entry})=><li key={entry.id}>{entry.displayName} — {formatBirthDateShort(entry.birthDate)} {entry.city?"· "+entry.city:""}</li>)}</ul>
      <p className="aniv-print-total">Total: {matching.length}</p>
    </div>
  </div>;
}
