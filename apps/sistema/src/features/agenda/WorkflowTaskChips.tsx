"use client";

import {useRef,useState,type PointerEvent,type KeyboardEvent} from "react";
import type {CoverageTaskDraft} from "./coverageTaskCatalog";

/** Um toque comum não abre menu. Movimento arrasta; 3s parado abre Editar/Excluir. */
export function WorkflowTaskChips({
 tasks,editable,onReorder,onLongPress,onTap,
}:{
 tasks:CoverageTaskDraft[];
 editable:boolean;
 onReorder?:(ordered:CoverageTaskDraft[])=>void;
 onLongPress?:(task:CoverageTaskDraft)=>void;
 onTap?:(task:CoverageTaskDraft)=>void;
}):JSX.Element{
 const list=useRef<HTMLDivElement|null>(null);
 const active=useRef<{
   pointerId:number;from:number;x:number;y:number;dragging:boolean;held:boolean;
 }|null>(null);
 const hold=useRef<ReturnType<typeof setTimeout>|null>(null);
 const suppressClick=useRef(false);
 const [dragging,setDragging]=useState<number|null>(null);
 const [hover,setHover]=useState<number|null>(null);
 const clearHold=()=>{if(hold.current!==null)clearTimeout(hold.current);hold.current=null;};
 const stop=()=>{clearHold();active.current=null;setDragging(null);setHover(null);};
 const atPoint=(x:number,y:number):number|null=>{
   const found=document.elementFromPoint(x,y)?.closest<HTMLElement>("[data-workflow-task-index]");
   if(!found||!list.current?.contains(found))return null;
   const n=Number(found.dataset.workflowTaskIndex);
   return Number.isInteger(n)&&n>=0&&n<tasks.length?n:null;
 };
 const reorder=(from:number,to:number)=>{
   if(!editable||!onReorder||from===to||to<0||to>=tasks.length)return;
   const ordered=[...tasks];
   const [task]=ordered.splice(from,1);
   ordered.splice(to,0,task);
   onReorder(ordered);
 };
 const down=(event:PointerEvent<HTMLButtonElement>,from:number)=>{
   if(!editable||event.button!==0)return;
   clearHold();
   suppressClick.current=false;
   active.current={pointerId:event.pointerId,from,x:event.clientX,y:event.clientY,dragging:false,held:false};
   try{event.currentTarget.setPointerCapture(event.pointerId);}catch{}
   hold.current=setTimeout(()=>{
     const state=active.current;
     if(!state||state.dragging||state.pointerId!==event.pointerId)return;
     state.held=true;
     suppressClick.current=true;
     onLongPress?.(tasks[from]);
   },3000);
 };
 const move=(event:PointerEvent<HTMLButtonElement>)=>{
   const state=active.current;
   if(!state||state.pointerId!==event.pointerId||state.held)return;
   if(!state.dragging&&Math.hypot(event.clientX-state.x,event.clientY-state.y)>10){
     state.dragging=true;
     clearHold();
     suppressClick.current=true;
     setDragging(state.from);
   }
   if(state.dragging)setHover(atPoint(event.clientX,event.clientY));
 };
 const up=(event:PointerEvent<HTMLButtonElement>)=>{
   const state=active.current;
   if(!state||state.pointerId!==event.pointerId)return;
   const target=state.dragging?atPoint(event.clientX,event.clientY):null;
   if(state.dragging&&target!==null)reorder(state.from,target);
   if(state.dragging||state.held)suppressClick.current=true;
   stop();
 };
 const keyDown=(event:KeyboardEvent<HTMLButtonElement>,index:number)=>{
   if(!editable||!event.altKey)return;
   const to=event.key==="ArrowLeft"||event.key==="ArrowUp"?index-1:
     event.key==="ArrowRight"||event.key==="ArrowDown"?index+1:null;
   if(to!==null){event.preventDefault();reorder(index,to);}
 };
 return <div className="workflow-selected-tasks" ref={list} role="group" aria-label="Funções selecionadas. Arraste para ordenar.">
   {tasks.map((task,index)=>editable?
     <button key={task.kind+":"+task.label} type="button"
       data-workflow-task-index={index}
       className={"workflow-selected-task"+(dragging===index?" is-dragging":"")+
         (hover===index&&dragging!==index?" is-drag-target":"")}
       title="Arraste para ordenar. Segure por 3 segundos para editar ou excluir."
       aria-label={task.label+". Arraste para ordenar ou mantenha pressionado para editar."}
       onPointerDown={event=>down(event,index)}
       onPointerMove={move} onPointerUp={up}
       onPointerCancel={stop}
       onLostPointerCapture={stop}
       onContextMenu={event=>event.preventDefault()}
       onKeyDown={event=>keyDown(event,index)}
       onClick={()=>{
         if(suppressClick.current){suppressClick.current=false;return;}
         onTap?.(task);
       }}>
        <span aria-hidden="true" className="workflow-task-grip">⠿</span>
        <span>{task.label}</span>
     </button>:
     <span key={task.kind+":"+task.label} className="workflow-selected-task is-read-only">
       {task.label}
     </span>)}
 </div>;
}
