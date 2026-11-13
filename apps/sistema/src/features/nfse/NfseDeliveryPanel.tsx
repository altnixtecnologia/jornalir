"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  listNfseDeliveriesAction, queueNfseEmailResendAction,
  registerNfseWhatsAppOpenAction, confirmNfseWhatsAppManualAction,
} from "../../app/sistema/nfse/notas/[id]/delivery-actions";
import {
  DELIVERY_STATUS_LABELS, whatsappComposeUrl,
  type NfseDeliveryEvent, type NfseDocumentAsset,
} from "../../lib/nfse/deliveryPolicy";

function dateTime(value: string | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day:"2-digit",month:"2-digit",year:"numeric",
    hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"America/Sao_Paulo",
  }).replace(","," às ")+"h";
}
const FILE_LABELS:Record<NfseDocumentAsset["kind"],string> = {
  nfse_xml:"XML oficial",dps_xml:"DPS assinada",danfse_pdf:"DANFSe PDF",
  cancellation_xml:"Evento de cancelamento",cancellation_response_xml:"Retorno de cancelamento",
};
export function NfseDeliveryPanel({
  noteId,noteNumber,initialOpen=false,previewMode=false,
}: {
  noteId:string;noteNumber:string;initialOpen?:boolean;previewMode?:boolean;
}):JSX.Element {
  const [open,setOpen] = useState(initialOpen);
  const [loading,start] = useTransition();
  const [events,setEvents] = useState<NfseDeliveryEvent[]>([]);
  const [assets,setAssets] = useState<NfseDocumentAsset[]>([]);
  const [error,setError] = useState<string | null>(null);
  const [info,setInfo] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (previewMode) return;
    start(async () => {
      const result = await listNfseDeliveriesAction(noteId);
      if ("error" in result) {setError(result.error);return;}
      setEvents(result.data.events);setAssets(result.data.assets);setError(null);
    });
  },[noteId,previewMode]);

  useEffect(() => { refresh(); },[refresh]);

  function resend():void {
    if (!window.confirm("Solicitar um NOVO envio da NFS-e ao e-mail fiscal atual do cliente? O histórico anterior será preservado.")) return;
    start(async () => {
      const response = await queueNfseEmailResendAction(noteId);
      if ("error" in response) {setError(response.error);return;}
      setInfo("Novo envio colocado na fila. Não significa que o e-mail foi entregue.");
      refresh();
    });
  }

  function openWhatsApp():void {
    const url = whatsappComposeUrl(noteNumber);
    // O usuário escolhe a conversa. Abrir em um clique real preserva o popup;
    // link não leva arquivos fiscais públicos.
    const opened = window.open(url,"_blank","noopener,noreferrer");
    if (!opened) {
      setError("O navegador pode ter bloqueado o WhatsApp. Permita a nova janela e tente novamente.");
      return;
    }
    setInfo("WhatsApp aberto. Selecione o contato e anexe o PDF manualmente; isto não confirma entrega.");
    if (!previewMode) {
      void registerNfseWhatsAppOpenAction(noteId).then((r) => {
        if ("error" in r) setError(r.error);
        else refresh();
      }).catch(()=>setError("Não foi possível registrar a abertura do WhatsApp."));
    }
  }
  function confirmWhatsApp(id:string):void {
    if (!window.confirm("Você realmente enviou o DANFSe ao cliente? Esta declaração ficará no histórico.")) return;
    start(async()=>{
      const result=await confirmNfseWhatsAppManualAction(id);
      if ("error" in result) {setError(result.error);return;}
      setInfo("Confirmação manual registrada. O WhatsApp não fornece comprovante automático nesta integração.");
      refresh();
    });
  }

  const content = (
    <div>
      {previewMode ? <p className="form-error">DEMONSTRAÇÃO — nenhum e-mail ou WhatsApp é enviado ou registrado aqui.</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {info ? <p className="helper-text" role="status">{info}</p> : null}
      <h3>Documentos fiscais</h3>
      <div className="form-actions">
        {!previewMode ? (
          <>
            <Link className="secondary-link" href={`/sistema/nfse/notas/${noteId}/danfse`} target="_blank">Visualizar / baixar PDF</Link>
            <Link className="secondary-link" href={`/sistema/nfse/notas/${noteId}/xml`} target="_blank">Baixar XML</Link>
          </>
        ):<span className="helper-text">PDF e XML somente após autorização oficial.</span>}
      </div>
      <p className="helper-text">
        Arquivos privados no R2: {assets.length ? assets.map(a=>FILE_LABELS[a.kind]).join(" · ") : "aguardando arquivamento/configuração"}.
      </p>
      <div className="form-actions">
        <button type="button" className="form-action-primary" disabled={loading||previewMode} onClick={resend}>Reenviar e-mail</button>
        <button type="button" className="secondary-link" onClick={openWhatsApp}>Abrir WhatsApp e escolher contato</button>
        <button type="button" className="secondary-link" disabled={loading} onClick={refresh}>Atualizar histórico</button>
      </div>
      <p className="helper-text">
        No computador, baixe o PDF e anexe-o à conversa no WhatsApp. Abrir o aplicativo não comprova que o documento foi enviado.
      </p>
      <h3>Histórico de entrega e compartilhamento</h3>
      {events.length===0 ? <p className="helper-text">{loading?"Carregando…":"Nenhuma tentativa registrada nesta nota."}</p> : (
        <ul className="destaques-list">
          {events.map(event=>(
            <li className="destaques-item" key={event.id}>
              <div className="destaques-item-body">
                <strong>{event.channel==="email"?"E-mail":"WhatsApp"} — {DELIVERY_STATUS_LABELS[event.status]}</strong>
                <span className="helper-text">Solicitado em {dateTime(event.requestedAt)} · {event.origin==="automatic"?"Automático":"Operador"}</span>
                {event.recipientSnapshot ? <span className="helper-text">Destinatário: {event.recipientSnapshot}</span>:null}
                {event.acceptedAt ? <span className="helper-text">Aceito pelo provedor: {dateTime(event.acceptedAt)}</span>:null}
                {event.deliveredAt ? <span className="helper-text">Entrega confirmada: {dateTime(event.deliveredAt)}</span>:null}
                {event.failedAt ? <span className="helper-text">Falha: {dateTime(event.failedAt)}</span>:null}
                {event.openedAt ? <span className="helper-text">Aberto: {dateTime(event.openedAt)}</span>:null}
                {event.confirmedAt ? <span className="helper-text">Operador confirmou: {dateTime(event.confirmedAt)}</span>:null}
                {event.responseSummary ? <span className="helper-text">{event.responseSummary}</span>:null}
                {event.channel==="whatsapp" && event.status==="opened" && !previewMode ? (
                  <button type="button" className="secondary-link" disabled={loading} onClick={()=>confirmWhatsApp(event.id)}>
                    Marcar como enviado pelo operador
                  </button>
                ):null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <>
      <section className="form-section">
        <h2>Entrega e compartilhamento da NFS-e</h2>
        <p className="helper-text">Acompanhe e-mail fiscal, data, hora, destinatário, documentos e WhatsApp, independentemente do estado fiscal.</p>
        <button type="button" className="secondary-link" onClick={()=>setOpen(true)}>Ver histórico completo e compartilhar</button>
        {events[0] ? <p className="helper-text">Última atividade: {DELIVERY_STATUS_LABELS[events[0].status]} · {dateTime(events[0].requestedAt)}</p> : null}
      </section>
      {open ? (
        <div role="presentation" style={{position:"fixed",inset:0,zIndex:120,background:"rgba(0,0,0,.68)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <section role="dialog" aria-modal="true" aria-label="Entrega de NFS-e" className="form-section"
            style={{width:"min(720px,100%)",maxHeight:"90vh",overflowY:"auto",background:"var(--surface, #fff)",color:"var(--text, #222)",borderRadius:14,padding:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",gap:16}}>
              <div><h2>NFS-e nº {noteNumber}</h2><p className="helper-text">Entrega dos documentos e histórico completo</p></div>
              <button type="button" className="secondary-link" aria-label="Fechar janela" onClick={()=>setOpen(false)}>Fechar ×</button>
            </div>
            {content}
          </section>
        </div>
      ):null}
    </>
  );
}
