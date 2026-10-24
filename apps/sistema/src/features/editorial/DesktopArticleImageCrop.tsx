"use client";

import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from "react";
import {centerCropForAspect,clamp01,cropSourcePixels,moveCrop,type CropRect,type CropPoint} from "./desktopCropMath";
import styles from "./DesktopArticleImageCrop.module.css";

type Aspect = {label:string;ratio:number|null};
const ASPECTS:Aspect[]=[
 {label:"Livre",ratio:null},{label:"1:1",ratio:1},
 {label:"4:3",ratio:4/3},{label:"16:9",ratio:16/9},
 {label:"3:4",ratio:3/4},{label:"9:16",ratio:9/16},
];
type Corner="nw"|"ne"|"sw"|"se";
type Gesture={kind:"move"|"resize"|"draw";start:CropPoint;initial:CropRect;corner:Corner};
interface Props{
 file:File;
 onCrop:(file:File)=>Promise<void>|void;
 onOriginal:()=>void;
 onCancel:()=>void;
}
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
const cropPercentage=(n:number)=>Math.round(n*10000)/100;

/** PC: quadro sobre a imagem original. Mobile continua em PreUploadImageCrop, sem modificações. */
export function DesktopArticleImageCrop({file,onCrop,onOriginal,onCancel}:Props):JSX.Element{
 const [src,setSrc]=useState("");
 const [natural,setNatural]=useState({w:0,h:0});
 const [stage,setStage]=useState({w:940,h:540});
 const [aspect,setAspect]=useState<number|null>(null);
 const [selection,setSelection]=useState<CropRect>({x:.05,y:.05,w:.9,h:.9});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState(false);
 const stageRef=useRef<HTMLDivElement>(null);
 const imageRef=useRef<HTMLImageElement>(null);
 const imageAreaRef=useRef<HTMLDivElement>(null);
 const gestureRef=useRef<Gesture|null>(null);

 useEffect(()=>{
   const objectUrl=URL.createObjectURL(file);
   setSrc(objectUrl);setNatural({w:0,h:0});
   setSelection({x:.05,y:.05,w:.9,h:.9});
   setAspect(null);setError("");setSuccess(false);
   return ()=>URL.revokeObjectURL(objectUrl);
 },[file]);
 useEffect(()=>{
   const el=stageRef.current;if(!el)return;
   const measure=()=>{
     const r=el.getBoundingClientRect();
     if(r.width>50&&r.height>50)setStage({w:r.width-24,h:r.height-24});
   };
   measure();
   const observer=new ResizeObserver(measure);observer.observe(el);
   return ()=>observer.disconnect();
 },[]);
 useEffect(()=>{
   const old=document.body.style.overflow;document.body.style.overflow="hidden";
   const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!busy)onCancel();};
   window.addEventListener("keydown",escape);
   return ()=>{document.body.style.overflow=old;window.removeEventListener("keydown",escape);};
 },[busy,onCancel]);

 const fit=natural.w>0&&natural.h>0?Math.min(stage.w/natural.w,stage.h/natural.h):1;
 const display={w:natural.w*fit,h:natural.h*fit};

 function point(event:ReactPointerEvent<HTMLDivElement>):CropPoint{
   const rect=imageAreaRef.current?.getBoundingClientRect();
   if(!rect)return {x:0,y:0};
   return {x:clamp01((event.clientX-rect.left)/rect.width),
     y:clamp01((event.clientY-rect.top)/rect.height)};
 }
 function rectangleFromAnchor(anchor:CropPoint,p:CropPoint,corner:Corner):CropRect{
   const east=corner.includes("e"),south=corner.includes("s");
   const maxW=east?1-anchor.x:anchor.x;
   const maxH=south?1-anchor.y:anchor.y;
   let w=clamp(Math.abs(p.x-anchor.x),.035,maxW);
   let h=clamp(Math.abs(p.y-anchor.y),.035,maxH);
   if(aspect&&natural.w>0&&natural.h>0){
     // Redimensionamento responde ao movimento horizontal OU vertical.
     // Limites sempre na imagem original, preservando a razão desejada.
     const heightToWidth=aspect*natural.h/natural.w;
     w=Math.min(maxW,maxH*heightToWidth,Math.max(w,h*heightToWidth));
     h=w/heightToWidth;
   }
   w=clamp(w,Math.min(.035,maxW),maxW);
   h=clamp(h,Math.min(.035,maxH),maxH);
   return {x:east?anchor.x:anchor.x-w,y:south?anchor.y:anchor.y-h,w,h};
 }
 function onDown(event:ReactPointerEvent<HTMLDivElement>):void{
   if(busy||!natural.w||!natural.h)return;
   const p=point(event);
   const target=event.target as Element;
   const corner=(target.closest("[data-crop-handle]")?.getAttribute("data-crop-handle")??"") as Corner;
   const inside=Boolean(target.closest("[data-crop-frame]"));
   gestureRef.current={kind:corner?"resize":inside?"move":"draw",
     start:p,initial:selection,corner:corner||"se"};
   event.currentTarget.setPointerCapture(event.pointerId);
   if(!corner&&!inside){
     setSelection(rectangleFromAnchor(p,{x:Math.min(1,p.x+.04),y:Math.min(1,p.y+.04)},"se"));
   }
 }
 function onMove(event:ReactPointerEvent<HTMLDivElement>):void{
   const state=gestureRef.current;if(!state)return;
   const p=point(event);
   if(state.kind==="move"){
     setSelection(moveCrop(state.initial,p.x-state.start.x,p.y-state.start.y));
     return;
   }
   if(state.kind==="draw"){
     const corner:Corner=((p.y>=state.start.y?"s":"n")+(p.x>=state.start.x?"e":"w")) as Corner;
     setSelection(rectangleFromAnchor(state.start,p,corner));
     return;
   }
   const r=state.initial;
   const anchor={
     x:state.corner.includes("e")?r.x:r.x+r.w,
     y:state.corner.includes("s")?r.y:r.y+r.h,
   };
   setSelection(rectangleFromAnchor(anchor,p,state.corner));
 }
 function onUp(event:ReactPointerEvent<HTMLDivElement>):void{
   gestureRef.current=null;
   if(event.currentTarget.hasPointerCapture(event.pointerId))
     event.currentTarget.releasePointerCapture(event.pointerId);
 }
 async function apply():Promise<void>{
   if(busy||!imageRef.current||!natural.w||!natural.h)return;
   setBusy(true);setError("");
   try{
     const srcRect=cropSourcePixels(selection,natural.w,natural.h);
     if(srcRect.width<8||srcRect.height<8)throw new Error("Amplie a seleção antes de recortar.");
     const scale=Math.min(1,3500/Math.max(srcRect.width,srcRect.height));
     const canvas=document.createElement("canvas");
     canvas.width=Math.max(1,Math.round(srcRect.width*scale));
     canvas.height=Math.max(1,Math.round(srcRect.height*scale));
     const ctx=canvas.getContext("2d");
     if(!ctx)throw new Error("Seu navegador não conseguiu abrir o editor de imagem.");
     ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
     ctx.drawImage(imageRef.current,srcRect.x,srcRect.y,srcRect.width,srcRect.height,
       0,0,canvas.width,canvas.height);
     const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(
       b=>b?resolve(b):reject(new Error("Falha na exportação do recorte.")),"image/jpeg",.91
     ));
     const filename=file.name.replace(/\.[^.]+$/,"")+"-recortada.jpg";
     await onCrop(new File([blob],filename,{type:"image/jpeg"}));
     setSuccess(true);
   }catch(cause){
     setError(cause instanceof Error?cause.message:"Não foi possível salvar o recorte.");
   }finally{setBusy(false);}
 }
 return <div className={styles.backdrop}>
   <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="desktop-crop-title">
     <header className={styles.header}>
       <div><small>RECORTE DIRETO · SOMENTE PC</small><h2 id="desktop-crop-title" title={file.name}>{file.name}</h2></div>
       <button type="button" disabled={busy} aria-label="Fechar recorte" onClick={onCancel}>✕</button>
     </header>
     <p className={styles.hint}>Arraste sobre a foto para selecionar outra área, arraste o quadro para mover e os cantos para redimensionar. A imagem original permanece intacta.</p>
     <div className={styles.canvas} ref={stageRef}>
       <div ref={imageAreaRef} className={styles.imageArea}
         style={{width:display.w,height:display.h}}
         onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
         {src?<img ref={imageRef} src={src} alt="Prévia original para selecionar o recorte"
           draggable={false}
           onLoad={e=>{
             const w=e.currentTarget.naturalWidth,h=e.currentTarget.naturalHeight;
             setNatural({w,h});
             setSelection(centerCropForAspect(w,h,aspect));
           }}
           onError={()=>setError("Não foi possível abrir esta foto para recorte.")}/>:null}
         {natural.w>0?<div className={styles.selection} data-crop-frame="true"
           style={{left:cropPercentage(selection.x)+"%",top:cropPercentage(selection.y)+"%",
             width:cropPercentage(selection.w)+"%",height:cropPercentage(selection.h)+"%"}}>
           {(["nw","ne","sw","se"] as const).map(c=><span key={c}
             data-crop-handle={c} aria-hidden="true"
             className={`${styles.handle} ${c==="nw"?styles.handleNW:
               c==="ne"?styles.handleNE:c==="sw"?styles.handleSW:styles.handleSE}`}/>)}
         </div>:null}
       </div>
     </div>
     <div className={styles.controls}>
       <strong>Proporção</strong>
       {ASPECTS.map(item=><button type="button" key={item.label}
         disabled={busy||!natural.w} aria-pressed={aspect===item.ratio}
         onClick={()=>{setAspect(item.ratio);setSelection(centerCropForAspect(natural.w,natural.h,item.ratio));}}>
         {item.label}</button>)}
       <span style={{fontSize:11,color:"#606779",marginLeft:"auto"}}>
         {natural.w>0?`${Math.round(selection.w*natural.w)} × ${Math.round(selection.h*natural.h)} px`:"Abrindo foto…"}
       </span>
     </div>
     {error?<p className={styles.error} role="alert">{error}</p>:null}
     {success?<p className={styles.hint} role="status">Recorte salvo. A foto original não foi sobrescrita.</p>:null}
     <footer className={styles.footer}>
       <button type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
       <button type="button" disabled={busy} onClick={onOriginal}>Manter original</button>
       <button className={styles.primary} type="button" disabled={busy||!natural.w}
         onClick={()=>void apply()}>{busy?"Salvando…":"Confirmar e salvar recorte"}</button>
     </footer>
   </section>
 </div>;
}
