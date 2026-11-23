import Link from "next/link";
import {notFound} from "next/navigation";
import {ModuleHeader} from "../../../../components/admin/ModuleHeader";
import {createSupabaseServerClient} from "../../../../lib/supabase/server";
import {asAudiencePeriod,AUDIENCE_PERIODS} from "../../../../lib/audiencia/ga4Report";
import {getAudienceData} from "../../../../lib/audiencia/ga4Data";

export const dynamic="force-dynamic";
export const revalidate=0;

function formatNumber(value:number):string {
  return new Intl.NumberFormat("pt-BR").format(value);
}
function dateLabel(yyyymmdd:string):string {
  return yyyymmdd.slice(6,8)+"/"+yyyymmdd.slice(4,6);
}
function Meter({value,max}:{value:number;max:number}):JSX.Element {
  return <div style={{height:7,background:"var(--surface-muted, #e2e8f0)",borderRadius:99,overflow:"hidden",marginTop:5}}>
    <div style={{height:"100%",width:(max>0?Math.min(100,100*value/max):0)+"%",background:"#557ca0",borderRadius:99}}/>
  </div>;
}

export default async function AudiencePage(props:{
  searchParams?:Promise<Record<string,string|string[]|undefined>>;
}):Promise<JSX.Element>{
  const supabase=createSupabaseServerClient();
  const user=await supabase.auth.getUser();
  if(user.error||!user.data.user)notFound();
  const [profile,permission]=await Promise.all([
    supabase.from("profiles").select("active").eq("id",user.data.user.id).maybeSingle(),
    supabase.rpc("staff_can_see_module",{p_module:"editorial"}),
  ]);
  if(profile.error||!profile.data?.active||permission.error||permission.data!==true)notFound();
  const query=await props.searchParams;
  const raw=Array.isArray(query?.period)?query?.period[0]:query?.period;
  const period=asAudiencePeriod(raw??"");
  const result=await getAudienceData(period);
  // O estado vazio é usado apenas nos cálculos da UI; nunca aparece como visita quando a API não está configurada.
  const data=result.status==="ready"?result.data:{views:0,visitors:0,sessions:0,days:[],hours:[],locations:[],articles:[]};
  const maxDays=Math.max(1,...(data?.days.map(d=>d.views)??[]));
  const maxHours=Math.max(1,...(data?.hours.map(h=>h.views)??[]));
  const topHours=[...(data?.hours??[])].sort((a,b)=>b.views-a.views).slice(0,8);
  const maxPlaces=Math.max(1,...(data?.locations.map(l=>l.users)??[]));
  const maxArticles=Math.max(1,...(data?.articles.map(a=>a.views)??[]));
  return <div className="inline-form">
    <ModuleHeader
      eyebrow="EDITORIAL / MATÉRIAS / AUDIÊNCIA"
      title="Audiência do portal"
      description="Visualizações e leitores do Informativo Regional, com dados do Google Analytics 4."
      action={<Link href="/sistema/editorial/materias" className="secondary-link">Voltar às matérias</Link>}
    />
    <section className="form-section form-section--first">
      <h2>Período</h2>
      <nav className="form-actions" aria-label="Filtrar período de audiência">
        {AUDIENCE_PERIODS.map(option=><Link key={option.value}
          href={"/sistema/editorial/audiencia?period="+option.value}
          className={option.value===period?"form-action-primary":"secondary-link"}
          aria-current={option.value===period?"page":undefined}>{option.label}</Link>)}
      </nav>
    </section>
    {result.status!=="ready" ? (
      <section className="form-section" role="status">
        <h2>{result.status==="not_configured"?"Aguardando conexão com o Analytics":"Dados temporariamente indisponíveis"}</h2>
        <p className="helper-text">{result.message}</p>
        {result.status==="not_configured" ? <p className="helper-text">É necessário configurar uma propriedade GA4 do portal, conceder acesso de leitura à API e habilitar a coleta no site com os cuidados de privacidade. Nenhuma visita é estimada ou inventada.</p>:null}
      </section>
    ) : <>
      <section className="form-section">
        <h2>Resumo</h2>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12}}>
          {[
            {label:"Visualizações de páginas",value:data.views},
            {label:"Usuários ativos",value:data.visitors},
            {label:"Sessões",value:data.sessions},
          ].map(item=><div key={item.label} style={{padding:16,border:"1px solid var(--border-color, #d7dde5)",borderRadius:12}}>
            <p className="helper-text">{item.label}</p>
            <p style={{fontSize:26,fontWeight:700,marginTop:5}}>{formatNumber(item.value)}</p>
          </div>)}
        </div>
        <p className="helper-text">Visualizações, usuários e sessões são medidas diferentes. O GA4 pode atualizar os dados com atraso; o relatório não é em tempo real.</p>
      </section>
      <section className="form-section">
        <h2>Movimento por dia</h2>
        {data.days.length===0?<p className="helper-text">Ainda não há visitas registradas neste período.</p>:
        <div style={{display:"grid",gap:10}}>
          {data.days.map(day=><div key={day.date} style={{display:"grid",gridTemplateColumns:"54px 1fr 70px",gap:12,alignItems:"center"}}>
            <span>{dateLabel(day.date)}</span><Meter value={day.views} max={maxDays}/><span style={{textAlign:"right"}}>{formatNumber(day.views)}</span>
          </div>)}
        </div>}
      </section>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:16}}>
        <section className="form-section">
          <h2>Horários de pico</h2>
          {topHours.length===0?<p className="helper-text">Sem horários registrados.</p>:
          <div style={{display:"grid",gap:10}}>
            {topHours.map(item=><div key={item.hour}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                <span>{item.hour}:00h</span><span>{formatNumber(item.views)} visualizações</span>
              </div>
              <Meter value={item.views} max={maxHours}/>
            </div>)}
            <p className="helper-text">Horas do fuso configurado na propriedade GA4; recomenda-se America/Sao_Paulo.</p>
          </div>}
        </section>
        <section className="form-section">
          <h2>Cidades e regiões</h2>
          {data.locations.length===0?<p className="helper-text">Sem regiões disponíveis neste período.</p>:
          <div style={{display:"grid",gap:10}}>
            {data.locations.map((item,index)=><div key={index}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                <span>{item.place}</span><span>{formatNumber(item.users)}</span>
              </div>
              <Meter value={item.users} max={maxPlaces}/>
            </div>)}
            <p className="helper-text">Localização aproximada fornecida pelo Google; pode haver linhas omitidas por privacidade.</p>
          </div>}
        </section>
      </div>
      <section className="form-section">
        <h2>Matérias mais vistas</h2>
        {data.articles.length===0?<p className="helper-text">Ainda não há visualizações de matérias registradas neste período.</p>:
        <ol style={{display:"grid",gap:14,paddingLeft:22}}>
          {data.articles.map(article=><li key={article.path}>
            <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"baseline"}}>
              <a className="materia-title-link" href={"https://www.informativoregional.net"+article.path}
                target="_blank" rel="noopener noreferrer">{article.title}</a>
              <span style={{whiteSpace:"nowrap"}}>{formatNumber(article.views)}</span>
            </div>
            <Meter value={article.views} max={maxArticles}/>
          </li>)}
        </ol>}
      </section>
    </>}
  </div>;
}
