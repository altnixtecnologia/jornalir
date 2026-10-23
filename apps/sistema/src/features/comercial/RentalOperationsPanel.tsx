"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
 createRentalAssetAction,changeRentalAssetStatusAction,createRentalBookingAction,
 changeRentalBookingStatusAction,recordRentalInspectionAction,
} from "../../app/sistema/publicidade/locacoes/actions";

type Asset = {
 id:string; product_id:string; asset_code:string; brand:string; model:string;
 serial_number:string|null; status:"available"|"maintenance"|"retired";
};
type Product = {id:string;name:string};
type Sale = {id:string;internal_reference:string;status:string;channel:string;product_id:string|null;items_snapshot:unknown};
type Booking = {
 id:string;commercial_sale_id:string;asset_id:string;
 start_at:string;end_at:string;status:"draft"|"reserved"|"checked_out"|"returned"|"cancelled";
 daily_rate:number;agreed_total:number;deposit_amount:number;collection_location:string;
 return_location:string;contact_person:string;
};
type Inspection = {booking_id:string;event_kind:"checkout"|"return"};
type Actions = {assets:boolean;bookings:boolean;inspections:boolean};

function field(form:FormData,name:string):string {return String(form.get(name)??"").trim();}
function isoLocal(form:FormData,name:string):string {
 const local=field(form,name);
 const date=new Date(local);
 if (!local || Number.isNaN(date.getTime())) throw new Error("Data e horário são obrigatórios.");
 return date.toISOString();
}
function format(date:string):string {return new Date(date).toLocaleString("pt-BR");}
function errorMessage(error:unknown):string{return error instanceof Error?error.message:"Erro ao executar operação.";}
const statuses:Record<Booking["status"],string> = {
 draft:"Rascunho",reserved:"Reservada",checked_out:"Retirado",returned:"Devolvido",cancelled:"Cancelada",
};

export function RentalOperationsPanel({assets,products,sales,bookings,inspections,permissions}:{
 assets:Asset[];products:Product[];sales:Sale[];bookings:Booking[];inspections:Inspection[];permissions:Actions;
}):JSX.Element {
 const router=useRouter();
 const [pending,startTransition]=useTransition();
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [inspectionBooking,setInspectionBooking]=useState("");
 const [inspectionKind,setInspectionKind]=useState<"checkout"|"return">("checkout");
 const [saleId,setSaleId]=useState("");
 const [assetId,setAssetId]=useState("");

 const eligibleSales=sales.filter(sale=>sale.status==="approved"||sale.status==="active").filter(sale=>{
  if (sale.product_id && assets.some(a=>a.product_id===sale.product_id)) return true;
  return Array.isArray(sale.items_snapshot)
    && sale.items_snapshot.some(v=>v&&typeof v==="object"&&"serviceChannel" in v&&v.serviceChannel==="equipment_rental");
 });

 function run(action:Promise<{error:string}|{ok:true}>,success:string):void {
  startTransition(async()=>{
   setError("");setMessage("");
   try{
    const response=await action;
    if("error" in response) setError(response.error);
    else{setMessage(success);router.refresh();}
   }catch(ex){setError(errorMessage(ex));}
  });
 }
 function registerAsset(ev:React.FormEvent<HTMLFormElement>):void{
  ev.preventDefault();const f=new FormData(ev.currentTarget);
  run(createRentalAssetAction({
   productId:field(f,"productId"),assetCode:field(f,"assetCode"),
   brand:field(f,"brand"),model:field(f,"model"),serialNumber:field(f,"serialNumber"),
   description:field(f,"description"),accessoryInventory:field(f,"accessoryInventory"),
   conditionNotes:field(f,"conditionNotes"),
  }),"Equipamento cadastrado.");
 }
 function book(ev:React.FormEvent<HTMLFormElement>):void{
  ev.preventDefault();const f=new FormData(ev.currentTarget);
  try {
   run(createRentalBookingAction({
    commercialSaleId:field(f,"saleId"),assetId:field(f,"assetId"),
    startAt:isoLocal(f,"startAt"),endAt:isoLocal(f,"endAt"),
    collectionLocation:field(f,"collectionLocation"),
    returnLocation:field(f,"returnLocation"),contactPerson:field(f,"contactPerson"),
    dailyRate:field(f,"dailyRate"),agreedTotal:field(f,"agreedTotal"),
    depositAmount:field(f,"depositAmount"),notes:field(f,"notes"),
   }),"Reserva cadastrada em rascunho.");
  } catch(ex){setError(errorMessage(ex));}
 }
 function inspect(ev:React.FormEvent<HTMLFormElement>):void{
  ev.preventDefault();const f=new FormData(ev.currentTarget);
  run(recordRentalInspectionAction({
   bookingId:inspectionBooking,kind:inspectionKind,
   conditionNotes:field(f,"conditionNotes"),accessoriesChecklist:field(f,"accessories"),
   acknowledgedBy:field(f,"acknowledgedBy")
  }),"Vistoria registrada e preservada no histórico.");
  setInspectionBooking("");
 }
 const inputStyle:React.CSSProperties={width:"100%",minWidth:0};
 const formGrid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:12};
 return (
  <div style={{display:"grid",gap:28}}>
   <p className="helper-text">
    Cadastro operacional. O contrato jurídico, comprovante assinado, fotos privadas e geração de cobrança só serão ativados após homologação.
    O cliente é obtido da venda existente; não há segundo cadastro.
   </p>
   {error?<p role="alert" style={{color:"var(--color-danger,#a22121)"}}>{error}</p>:null}
   {message?<p role="status">{message}</p>:null}

   <section>
    <h2>1. Inventário de aparelhos</h2>
    <p className="helper-text">Cada patrimônio ou número de série é um equipamento físico, ligado a um produto de locação.</p>
    {permissions.assets?(
     <form onSubmit={registerAsset} style={{display:"grid",gap:12}}>
      <div style={formGrid}>
       <label>Produto de locação
        <select required name="productId" style={inputStyle} defaultValue="">
         <option value="" disabled>Selecione o produto</option>
         {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
       </label>
       <label>Patrimônio/etiqueta<input style={inputStyle} name="assetCode" required maxLength={60}/></label>
       <label>Marca<input style={inputStyle} name="brand" required maxLength={120}/></label>
       <label>Modelo<input style={inputStyle} name="model" required maxLength={120}/></label>
       <label>Número de série<input style={inputStyle} name="serialNumber" maxLength={160}/></label>
       <label>Acessórios<textarea style={inputStyle} name="accessoryInventory" rows={2}/></label>
       <label>Estado inicial<textarea style={inputStyle} name="conditionNotes" rows={2}/></label>
       <label>Observações<textarea style={inputStyle} name="description" rows={2}/></label>
      </div>
      <div><button disabled={pending||!products.length} type="submit">Cadastrar aparelho</button></div>
     </form>
    ):null}
    {assets.length?(
     <div style={{overflowX:"auto",marginTop:12}}>
      <table style={{width:"100%"}}><thead><tr><th>Patrimônio</th><th>Equipamento</th><th>Série</th><th>Condição</th></tr></thead>
       <tbody>{assets.map(a=><tr key={a.id}>
        <td>{a.asset_code}</td><td>{a.brand} {a.model}</td><td>{a.serial_number||"—"}</td>
        <td>{permissions.assets?(
         <select aria-label={"Estado "+a.asset_code} value={a.status} disabled={pending}
          onChange={ev=>run(changeRentalAssetStatusAction(a.id,ev.target.value as Asset["status"]),"Estado do equipamento atualizado.")}>
          <option value="available">Disponível</option><option value="maintenance">Manutenção</option><option value="retired">Desativado</option>
         </select>
        ):a.status}</td>
       </tr>)}</tbody>
      </table>
     </div>
    ):<p>Nenhum equipamento cadastrado.</p>}
   </section>

   <section>
    <h2>2. Reserva vinculada à venda</h2>
    <p className="helper-text">A venda precisa estar aprovada/ativa e conter um serviço de locação. Os valores e períodos são informados explicitamente.</p>
    {permissions.bookings?(
     <form onSubmit={book} style={{display:"grid",gap:12}}>
      <div style={formGrid}>
       <label>Venda
        <select name="saleId" required style={inputStyle} value={saleId} onChange={e=>setSaleId(e.target.value)}>
         <option value="">Selecione uma venda aprovada</option>
         {eligibleSales.map(s=><option value={s.id} key={s.id}>{s.internal_reference}</option>)}
        </select>
       </label>
       <label>Equipamento
        <select name="assetId" required style={inputStyle} value={assetId} onChange={e=>setAssetId(e.target.value)}>
         <option value="">Selecione um patrimônio</option>
         {assets.filter(a=>a.status==="available").map(a=><option key={a.id} value={a.id}>{a.asset_code} · {a.brand} {a.model}</option>)}
        </select>
       </label>
       <label>Retirada<input style={inputStyle} required name="startAt" type="datetime-local"/></label>
       <label>Devolução prevista<input style={inputStyle} required name="endAt" type="datetime-local"/></label>
       <label>Local da retirada<input style={inputStyle} required name="collectionLocation"/></label>
       <label>Local da devolução<input style={inputStyle} required name="returnLocation"/></label>
       <label>Responsável pela retirada<input style={inputStyle} required name="contactPerson"/></label>
       <label>Diária (R$)<input style={inputStyle} required name="dailyRate" type="number" min="0" step=".01"/></label>
       <label>Total acordado (R$)<input style={inputStyle} required name="agreedTotal" type="number" min="0" step=".01"/></label>
       <label>Caução (R$; zero se não houver)<input style={inputStyle} required name="depositAmount" type="number" min="0" step=".01"/></label>
      </div>
      <label>Observações sobre a reserva<textarea name="notes" style={inputStyle} rows={2}/></label>
      <div><button disabled={pending||!assetId||!saleId} type="submit">Criar reserva</button></div>
     </form>
    ):null}
    {!eligibleSales.length?<p className="helper-text">Nenhuma venda aprovada com locação identificada. Registre o produto, faça a proposta e converta-a em venda antes de reservar.</p>:null}
   </section>

   <section>
    <h2>3. Reservas, retirada e devolução</h2>
    {bookings.length?<div style={{display:"grid",gap:12}}>
     {bookings.map(b=>{
      const asset=assets.find(a=>a.id===b.asset_id);
      const hasCheckout=inspections.some(i=>i.booking_id===b.id&&i.event_kind==="checkout");
      const hasReturn=inspections.some(i=>i.booking_id===b.id&&i.event_kind==="return");
      return <div key={b.id} style={{border:"1px solid var(--color-border,#ccc)",padding:14,borderRadius:8}}>
       <strong>{asset?.asset_code||b.asset_id} · {statuses[b.status]}</strong>
       <p className="helper-text">Venda {sales.find(s=>s.id===b.commercial_sale_id)?.internal_reference||b.commercial_sale_id}</p>
       <p>{format(b.start_at)} até {format(b.end_at)} · {b.contact_person} · R$ {Number(b.agreed_total).toFixed(2)}</p>
       <p className="helper-text">Retirada: {b.collection_location} · Devolução: {b.return_location} · Vistoria retirada: {hasCheckout?"registrada":"pendente"} · devolução: {hasReturn?"registrada":"pendente"}</p>
       <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {permissions.bookings&&b.status==="draft"?<button disabled={pending} onClick={()=>run(changeRentalBookingStatusAction(b.id,"reserved"),"Reserva confirmada.")}>Confirmar reserva</button>:null}
        {permissions.inspections&&b.status==="reserved"&&!hasCheckout?<button disabled={pending} onClick={()=>{setInspectionBooking(b.id);setInspectionKind("checkout");}}>Registrar vistoria de entrega</button>:null}
        {permissions.bookings&&b.status==="reserved"&&hasCheckout?<button disabled={pending} onClick={()=>run(changeRentalBookingStatusAction(b.id,"checked_out"),"Retirada confirmada.")}>Confirmar retirada</button>:null}
        {permissions.inspections&&b.status==="checked_out"&&!hasReturn?<button disabled={pending} onClick={()=>{setInspectionBooking(b.id);setInspectionKind("return");}}>Registrar vistoria de devolução</button>:null}
        {permissions.bookings&&b.status==="checked_out"&&hasReturn?<button disabled={pending} onClick={()=>run(changeRentalBookingStatusAction(b.id,"returned"),"Devolução concluída.")}>Concluir devolução</button>:null}
        {permissions.bookings&&(b.status==="draft"||b.status==="reserved")?<button disabled={pending} onClick={()=>run(changeRentalBookingStatusAction(b.id,"cancelled"),"Reserva cancelada.")}>Cancelar reserva</button>:null}
       </div>
       {inspectionBooking===b.id&&permissions.inspections?(
        <form onSubmit={inspect} style={{display:"grid",gap:10,marginTop:12}}>
         <strong>{inspectionKind==="checkout"?"Vistoria de entrega":"Vistoria de devolução"}</strong>
         <label>Estado, conservação e avarias<textarea name="conditionNotes" required rows={3}/></label>
         <label>Acessórios conferidos (um por linha)<textarea name="accessories" rows={3}/></label>
         <label>Nome de quem conferiu/recebeu<input name="acknowledgedBy" required/></label>
         <p className="helper-text">Esse registro é imutável. Fotos e assinatura digital serão disponibilizadas quando o armazenamento privado estiver homologado.</p>
         <div style={{display:"flex",gap:8}}><button disabled={pending}>Registrar vistoria</button><button type="button" onClick={()=>setInspectionBooking("")}>Fechar</button></div>
        </form>
       ):null}
      </div>;
     })}
    </div>:<p>Nenhuma reserva registrada.</p>}
   </section>
  </div>
 );
}
