"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import styles from "./PautaTvBoard.module.css";

type PairState={requestId:string;proof:string;code:string;expiresInSeconds:number};
export function PairingTvClient():JSX.Element{
 const router=useRouter();
 const [pair,setPair]=useState<PairState|null>(null);
 const [error,setError]=useState("");
 const [remaining,setRemaining]=useState(600);
 useEffect(()=>{
   let disposed=false;
   let current:PairState|null=null;
   let started=Date.now();
   let busy=false;
   async function begin():Promise<void>{
     try{
       const response=await fetch("/api/tv-pauta/pair/start",{
         method:"POST",credentials:"same-origin",cache:"no-store",
       });
       if(!response.ok)throw Error("Não foi possível iniciar a autorização.");
       const data=await response.json() as PairState;
       if(!disposed){current=data;setPair(data);setError("");started=Date.now();}
     }catch{if(!disposed)setError("Conexão indisponível. Tente novamente.");}
   }
   void begin();
   const timer=setInterval(async()=>{
     if(disposed)return;
     const remainingNow=Math.max(0,600-Math.floor((Date.now()-started)/1000));
     setRemaining(remainingNow);
     if(remainingNow===0){current=null;setPair(null);clearInterval(timer);setError("Código expirado. Reabra o aplicativo para obter outro.");return;}
     if(!current||busy)return;
     busy=true;
     try{
       const response=await fetch("/api/tv-pauta/pair/claim",{
         method:"POST",credentials:"same-origin",cache:"no-store",
         headers:{"Content-Type":"application/json"},
         body:JSON.stringify({requestId:current.requestId,proof:current.proof}),
       });
       const result=await response.json() as {authorized?:boolean};
       if(result.authorized){clearInterval(timer);router.refresh();}
     }catch{/* Falha de rede temporária: tentar novamente na próxima leitura. */}
     finally{busy=false;}
   },4000);
   return ()=>{disposed=true;clearInterval(timer);};
 },[router]);
 return <main className={styles.screen} style={{display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center"}}>
   <section style={{maxWidth:600,display:"grid",gap:22}}>
     <strong style={{letterSpacing:".14em",fontSize:16}}>INFORMATIVO REGIONAL</strong>
     <h1 style={{fontSize:"clamp(24px,3.5vh,48px)",margin:0}}>AUTORIZAR TV PAUTA</h1>
     <p style={{fontSize:"clamp(14px,1.8vh,22px)",margin:0}}>No Sistema IR, abra <strong>Configurações → TV Pauta</strong> e informe este código:</p>
     <div aria-label="Código de autorização" style={{fontSize:"clamp(42px,8vh,90px)",fontWeight:900,letterSpacing:".18em",fontVariantNumeric:"tabular-nums"}}>
       {pair?.code??"······"}
     </div>
     <p style={{color:"#c4cfe8",fontSize:16,margin:0}}>{error || ("Aguardando autorização · validade "+Math.ceil(remaining/60)+" min")}</p>
     <p style={{color:"#9fadcc",fontSize:14,margin:0}}>Não precisa de usuário, senha ou PIN nesta televisão.</p>
   </section>
 </main>;
}
