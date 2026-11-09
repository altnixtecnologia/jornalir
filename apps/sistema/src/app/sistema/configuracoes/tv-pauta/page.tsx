import Link from "next/link";
import {createSupabaseServerClient} from "../../../../lib/supabase/server";
import {ModuleHeader} from "../../../../components/admin/ModuleHeader";
import {approveTvAction,revokeTvAction} from "./actions";

export const dynamic="force-dynamic";

type Device={id:string;name:string;registeredAt:string;lastSeenAt:string|null;revokedAt:string|null};
function when(value:string|null):string{
 return value?new Date(value).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"Ainda não conectado";
}
const errors:Record<string,string>={
 dados:"Confira o nome do aparelho e o código de seis números.",
 codigo:"Código não encontrado, expirado ou já autorizado. Veja o código exibido na TV.",
 revogar:"Não foi possível revogar o acesso. Atualize a página e tente novamente.",
};
export default async function TvPautaSettingsPage({
 searchParams,
}:{searchParams?:Promise<Record<string,string|string[]|undefined>>}):Promise<JSX.Element>{
 const db=createSupabaseServerClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)throw Error("Sessão inválida.");
 const {data:profile}=await db.from("profiles").select("active,role").eq("id",user.id).maybeSingle();
 if(!profile?.active||!["owner","admin"].includes(profile.role))
  throw Error("Sem permissão para gerenciar TV Pauta.");
 const {data,error}=await db.rpc("tv_pauta_list_devices");
 const devices:Device[]=error?[]:Array.isArray(data?.devices)?data.devices:[];
 const pending: number=error?0:Number(data?.pending??0);
 const params=await searchParams;
 const problem=typeof params?.erro==="string"?errors[params.erro]:null;
 const success=params?.resultado==="autorizado"?"TV autorizada. O painel abrirá automaticamente no aparelho.":params?.resultado==="revogado"?"Acesso revogado. A TV não poderá consultar a Pauta.":null;
 return <>
  <ModuleHeader eyebrow="CONFIGURAÇÕES / TV PAUTA" title="TV Pauta"
    description="Autorize e gerencie as TVs que exibem o fechamento do jornal. Nenhum usuário ou senha é necessário no aparelho."/>
  <section className="form-section form-section--first" style={{display:"grid",gap:16}}>
   <Link href="/sistema/configuracoes">← Voltar às Configurações</Link>
   {problem?<p role="alert" style={{color:"#a42b2b"}}>{problem}</p>:null}
   {success?<p role="status" style={{color:"#11603d"}}>{success}</p>:null}
   {error?<p role="alert">Não foi possível consultar os aparelhos. {error.message}</p>:null}
   <h2>Autorizar uma televisão</h2>
   <p>Abra o aplicativo Pauta TV na televisão. Ele mostrará um código temporário.
    Digite aqui esse código e o nome do aparelho. O vínculo fica salvo e pode ser revogado abaixo.</p>
   <p>Pedidos de autorização aguardando: <strong>{pending}</strong></p>
   <form action={approveTvAction} className="form-grid" style={{alignItems:"end",gap:12}}>
    <label style={{display:"grid",gap:5}}>
      <span>Código exibido na TV</span>
      <input name="code" type="text" pattern="[0-9]{6}" inputMode="numeric"
        maxLength={6} minLength={6} placeholder="000000" autoComplete="off" required/>
    </label>
    <label style={{display:"grid",gap:5}}>
      <span>Identificação da TV</span>
      <input name="name" defaultValue="TV Jornal" minLength={2} maxLength={60} required/>
    </label>
    <button className="agenda-primary" type="submit" disabled={Boolean(error)}>Autorizar TV</button>
   </form>
  </section>
  <section className="form-section" style={{display:"grid",gap:12}}>
   <h2>Televisões cadastradas</h2>
   {devices.length===0?<p>Nenhuma televisão autorizada ainda.</p>:
    <div style={{display:"grid",gap:10}}>
     {devices.map(device=><article key={device.id}
        style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:15,flexWrap:"wrap",border:"1px solid var(--line)",borderRadius:9,padding:13}}>
       <div style={{display:"grid",gap:4}}>
        <strong>{device.name}</strong>
        <small>{device.revokedAt?"Acesso revogado em "+when(device.revokedAt):"Autorizada · somente leitura"}</small>
        <small>Ativada: {when(device.registeredAt)} · Último acesso: {when(device.lastSeenAt)}</small>
       </div>
       {!device.revokedAt?<form action={revokeTvAction}>
         <input type="hidden" name="id" value={device.id}/>
         <button type="submit" style={{color:"#aa3030"}}>Revogar acesso</button>
       </form>:null}
     </article>)}
    </div>}
   <p style={{fontSize:12,color:"var(--muted)"}}>
    A autorização é exclusiva para a leitura da Pauta. Mesmo com acesso revogado, o aparelho continua instalado,
    mas não consegue consultar as matérias. Para voltar a utilizá-lo, será necessário autorizar um novo código.
   </p>
  </section>
 </>;
}
