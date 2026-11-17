"use client";

import {usePathname,useRouter} from "next/navigation";

/** Voltar padronizado para módulos administrativos, sem navegar
 * para fora do sistema em acessos diretos. */
export function ModuleBackButton():JSX.Element|null{
 const pathname=usePathname(),router=useRouter();
 if(!pathname||pathname==="/sistema"||pathname==="/sistema/")return null;
 const parts=pathname.split("/").filter(Boolean);
 const fallback=pathname==="/sistema/preferencias-notificacoes"
   ?"/sistema/perfil"
   :parts.length<=3?"/sistema":"/"+parts.slice(0,-1).join("/");
 function goBack():void{
   try{
     const ref=document.referrer?new URL(document.referrer):null;
     if(ref&&ref.origin===window.location.origin&&window.history.length>1){
       router.back();return;
     }
   }catch{
     // URL de referência inválida: usar a rota segura.
   }
   router.push(fallback);
 }
 return <button type="button" className="module-back-button"
   aria-label="Voltar à tela anterior" title="Voltar" onClick={goBack}>
   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
     <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round"/>
   </svg>
   Voltar
 </button>;
}
