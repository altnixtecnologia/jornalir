"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { calculateTvPagination, type TvPautaSnapshot } from "./tvModel";
import styles from "./PautaTvBoard.module.css";

function shortDate(value:string):string {
  const [,month,day]=value.split("-");
  return day+"/"+month;
}
const LABELS={
  in_progress:"EM PRODUÇÃO",
  pending:"PENDENTE",
  completed:"CONCLUÍDA",
  cancelled:"CANCELADA",
} as const;

export function PautaTvBoard({snapshot,deviceMode=false}:{
  snapshot:TvPautaSnapshot;deviceMode?:boolean;
}):JSX.Element {
  const router=useRouter();
  const [deviceSnapshot,setDeviceSnapshot]=useState(snapshot);
  const activeSnapshot=deviceMode?deviceSnapshot:snapshot;
  useEffect(()=>{setDeviceSnapshot(snapshot);},[snapshot]);
  const [height,setHeight]=useState(0);
  const [page,setPage]=useState(0);
  const [connected,setConnected]=useState(true);
  const [clock,setClock]=useState("");
  const listRef=useRef<HTMLDivElement>(null);
  const timeoutRef=useRef<ReturnType<typeof setTimeout>|null>(null);

  const pagination=useMemo(
    ()=>calculateTvPagination(height,activeSnapshot.cards.length),
    [height,activeSnapshot.cards.length],
  );
  const currentPage=Math.min(page,pagination.pages-1);
  const visible=pagination.perPage===0?[]:
    activeSnapshot.cards.slice(currentPage*pagination.perPage,(currentPage+1)*pagination.perPage);
  const progress=activeSnapshot.total===0?0:Math.round(activeSnapshot.completed/activeSnapshot.total*100);

  useEffect(()=>{
    const node=listRef.current;
    if(!node)return;
    const resize=new ResizeObserver(entries=>{
      const next=Math.floor(entries[0]?.contentRect.height??0);
      setHeight(next);
    });
    resize.observe(node);
    return ()=>resize.disconnect();
  },[]);

  useEffect(()=>{
    const update=()=>setClock(new Intl.DateTimeFormat("pt-BR",{
      timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",
    }).format(new Date()));
    update();
    const timer=setInterval(update,30000);
    return ()=>clearInterval(timer);
  },[]);

  useEffect(()=>{
    setPage(0);
  },[activeSnapshot.weekStart,pagination.perPage]);

  useEffect(()=>{
    if(pagination.pages<=1)return;
    const timer=setInterval(()=>setPage(value=>(value+1)%pagination.pages),12000);
    return ()=>clearInterval(timer);
  },[pagination.pages]);

  useEffect(()=>{
    if(!deviceMode)return;
    let disposed=false;
    let fetching=false;
    async function refresh():Promise<void>{
      if(disposed||fetching)return;
      fetching=true;
      try{
        // 5 segundos para mudanças quase em tempo real, sem permissões de
        // leitura para o banco no WebView. Sessão por cookie HttpOnly.
        const selected=new URLSearchParams(window.location.search).get("date");
        const url="/api/tv-pauta/snapshot"+(selected?"?date="+encodeURIComponent(selected):"");
        const response=await fetch(url,{cache:"no-store",credentials:"same-origin"});
        if(response.status===401){router.refresh();return;}
        if(!response.ok)throw Error("Falha de conexão");
        const next=(await response.json()) as TvPautaSnapshot;
        if(!disposed){setDeviceSnapshot(next);setConnected(true);}
      }catch{if(!disposed)setConnected(false);}
      finally{fetching=false;}
    }
    const onOnline=()=>{void refresh();};
    const onOffline=()=>setConnected(false);
    const interval=setInterval(()=>{void refresh();},5000);
    window.addEventListener("online",onOnline);
    window.addEventListener("offline",onOffline);
    return ()=>{
      disposed=true;clearInterval(interval);
      window.removeEventListener("online",onOnline);
      window.removeEventListener("offline",onOffline);
    };
  },[deviceMode,router]);

  useEffect(()=>{
    if(deviceMode)return;
    // Sessão autenticada com permissões de Pauta (nunca service_role na TV).
    // Eventos chegam por Realtime; fallback a cada minuto cobre reconexões
    // e alterações feitas fora desta instância.
    const client=createSupabaseBrowserClient();
    let stopped=false;
    const refresh=()=>{
      if(stopped||timeoutRef.current)return;
      timeoutRef.current=setTimeout(()=>{
        timeoutRef.current=null;
        if(!stopped)router.refresh();
      },700);
    };
    const channel=client.channel("tv-pauta-"+activeSnapshot.weekStart)
      .on("postgres_changes",{event:"*",schema:"public",table:"weekly_pauta_items"},refresh)
      .on("postgres_changes",{event:"*",schema:"public",table:"agenda_events"},refresh)
      .on("postgres_changes",{event:"*",schema:"public",table:"agenda_event_assignees"},refresh)
      .on("postgres_changes",{event:"*",schema:"public",table:"event_coverages"},refresh)
      .on("postgres_changes",{event:"*",schema:"public",table:"event_coverage_members"},refresh)
      .on("postgres_changes",{event:"*",schema:"public",table:"event_coverage_member_transfers"},refresh)
      .on("postgres_changes",{event:"*",schema:"public",table:"pauta_week_overrides"},refresh)
      .subscribe(status=>{
        if(stopped)return;
        setConnected(status==="SUBSCRIBED");
        if(status==="SUBSCRIBED")refresh();
      });
    const poll=setInterval(()=>{if(!stopped)router.refresh();},60000);
    const onOnline=()=>{setConnected(true);refresh();};
    const onOffline=()=>setConnected(false);
    window.addEventListener("online",onOnline);
    window.addEventListener("offline",onOffline);
    return ()=>{
      stopped=true;
      if(timeoutRef.current){clearTimeout(timeoutRef.current);timeoutRef.current=null;}
      clearInterval(poll);
      window.removeEventListener("online",onOnline);
      window.removeEventListener("offline",onOffline);
      void client.removeChannel(channel);
    };
  },[router,activeSnapshot.weekStart,deviceMode]);

  const toggleFullscreen=()=>{
    if(document.fullscreenElement){void document.exitFullscreen();return;}
    void document.documentElement.requestFullscreen?.();
  };

  return <main className={styles.screen} aria-label="Painel de fechamento do jornal">
    <header className={styles.header}>
      <div className={styles.brand}>INFORMATIVO REGIONAL</div>
      <div className={styles.titleRow}>
        <div>
          <h1>FECHAMENTO DA EDIÇÃO</h1>
          <p>PAUTA · {shortDate(activeSnapshot.periodStart)} A {shortDate(activeSnapshot.periodEnd)}</p>
        </div>
        <button className={styles.fullscreen} title="Alternar tela cheia" aria-label="Alternar tela cheia"
          onClick={toggleFullscreen}>⛶</button>
      </div>
      <div className={styles.summary} aria-label="Resumo do fechamento">
        <div><strong>{activeSnapshot.total}</strong><span>Pautas</span></div>
        <div><strong>{activeSnapshot.completed}</strong><span>Concluídas</span></div>
        <div><strong>{activeSnapshot.pending}</strong><span>Pendentes</span></div>
      </div>
      <div className={styles.progress} aria-label={progress+"% concluído"}>
        <span style={{width:progress+"%"}} />
      </div>
    </header>
    <section className={styles.sectionLabel}>
      <strong>ANDAMENTO DAS MATÉRIAS</strong>
      <span>{pagination.pages>1 ? (currentPage+1)+"/"+pagination.pages+" · Alternância automática" : "Atualização em tempo real"}</span>
    </section>
    <div className={styles.listViewport} ref={listRef}>
      {visible.length===0?
        <div className={styles.empty}>Nenhuma pauta cadastrada para este período.</div>
        :<div className={styles.list} style={{
          gridTemplateRows:"repeat("+visible.length+", minmax(0,1fr))",
          ["--tv-row-px" as string]:pagination.rowPx+"px",
        }}>
          {visible.map(card=><article className={styles.card+" "+styles[card.status]} key={card.id}>
            <div className={styles.cardMain}>
              <strong title={card.title}>{card.title}</strong>
            </div>
            <div className={styles.cardFooter}>
              <span className={styles.owner}>{card.responsible}</span>
              <span className={styles.status}>{LABELS[card.status]}</span>
            </div>
          </article>)}
        </div>}
    </div>
    <footer className={styles.footer}>
      <span className={connected?styles.online:styles.offline}>● {connected?"SINCRONIZADO":"RECONECTANDO"}</span>
      <span>{clock}h · JORNAL IR</span>
    </footer>
  </main>;
}
