"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { birthdayWithinEdition } from "./birthdayWeek";
import type {
  EditorialBirthdayInput, EditorialBirthdayMessage, EditorialBirthdayRow,
} from "./editorialBirthdayTypes";
import type { BirthdayClientRow } from "./ClientBirthdayDirectory";
import {
  prepareBirthdayEditionMessage, saveEditorialBirthday, setEditorialBirthdayActive,
} from "../../app/sistema/aniversariantes/actions";

function fromSaved(row: EditorialBirthdayRow): EditorialBirthdayInput {
  return {
    id: row.id, displayName:row.display_name,
    birthDate: `${row.birth_year ?? 2000}-${String(row.birth_month).padStart(2,"0")}-${String(row.birth_day).padStart(2,"0")}`,
    city:row.city || "", groupClientId:row.group_client_id,
    relationship:row.relationship || "", profession:row.profession || "",
    organization:row.organization || "", knownAs:row.known_as || "",
    messageContext:row.message_context || "", notes:row.notes || "",
    publishInPrint:row.publish_in_print,
  };
}
function shortDate(date: string): string {
  return date.slice(8,10) + "/" + date.slice(5,7);
}

export function EditorialBirthdayPanel({ clients, entries, initialMessages, weekStart }: {
  clients: BirthdayClientRow[];
  entries: EditorialBirthdayRow[];
  initialMessages: EditorialBirthdayMessage[];
  weekStart: string;
}): JSX.Element {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [editing, setEditing] = useState<EditorialBirthdayInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string,EditorialBirthdayMessage>>(
    () => Object.fromEntries(initialMessages.map(m=>[m.birthday_entry_id,m])),
  );

  const clientMap = useMemo(()=>new Map(clients.map(c=>[c.id,c])),[clients]);
  const manual = useMemo(()=>entries.filter(e=>e.source_client_id===null)
    .sort((a,b)=>a.display_name.localeCompare(b.display_name,"pt-BR")),[entries]);

  const thisWeek = useMemo(()=>{
    const candidates: Array<{id:string;name:string;birthDate:string;city:string;origin:"cliente"|"editorial"; active:boolean}> = [];
    clients.forEach(c=>{
      if(c.kind==="individual" && c.birthDate && birthdayWithinEdition(c.birthDate,weekStart)){
        candidates.push({id:c.id,name:c.name,birthDate:c.birthDate,city:c.city,origin:"cliente",active:true});
      }
    });
    manual.forEach(e=>{
      const date = `${e.birth_year ?? 2000}-${String(e.birth_month).padStart(2,"0")}-${String(e.birth_day).padStart(2,"0")}`;
      if(e.active && birthdayWithinEdition(date,weekStart)){
        candidates.push({id:e.id,name:e.display_name,birthDate:date,city:e.city||"",origin:"editorial",active:e.active});
      }
    });
    return candidates.sort((a,b)=>a.birthDate.slice(5).localeCompare(b.birthDate.slice(5)) || a.name.localeCompare(b.name,"pt-BR"));
  },[clients,manual,weekStart]);

  function update<K extends keyof EditorialBirthdayInput>(key:K, value:EditorialBirthdayInput[K]):void {
    setEditing(prev=>prev ? {...prev,[key]:value}:prev);
  }
  function save():void {
    if(!editing || busy) return;
    setError(null);setSuccess(null);
    startTransition(async()=>{
      const r=await saveEditorialBirthday(editing);
      if("error" in r){setError(r.error);return;}
      setSuccess("Aniversariante salvo no banco.");
      setEditing(null);
      router.refresh();
    });
  }
  function changeStatus(row:EditorialBirthdayRow):void {
    if(busy) return;
    setError(null);setSuccess(null);
    startTransition(async()=>{
      const r=await setEditorialBirthdayActive(row.id,!row.active);
      if("error" in r) setError(r.error);
      else {setSuccess(row.active?"Registro desativado e preservado.":"Registro reativado.");router.refresh();}
    });
  }
  function prepare(origin:"cliente"|"editorial",id:string,regenerate:boolean):void {
    if(busy)return;
    setError(null);setSuccess(null);
    startTransition(async()=>{
      const r=await prepareBirthdayEditionMessage(origin,id,regenerate);
      if("error" in r){setError(r.error);return;}
      setMessages(prev=>({...prev,[r.data.birthday_entry_id]:r.data}));
      setSuccess("Mensagem da semana salva. A alteração permanece após atualizar a página.");
      router.refresh();
    });
  }
  async function copyText(message:string):Promise<void> {
    try {
      await navigator.clipboard.writeText(message);
      setSuccess("Mensagem copiada.");
    } catch {
      setError("Não foi possível copiar. Selecione o texto manualmente.");
    }
  }

  return (
    <div className="aniv-module" style={{display:"grid",gap:16}}>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {success ? <p className="helper-text" role="status">{success}</p> : null}

      <section className="form-section">
        <h2>Mensagens da semana do jornal</h2>
        {!thisWeek.length ? <p className="helper-text">Nenhum aniversariante nesta semana.</p> : (
          <div style={{display:"grid",gap:12}}>
            {thisWeek.map(person=>{
              const saved=messages[person.id];
              return (
                <div className="aniv-entry" key={person.origin+person.id} style={{padding:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <div>
                      <strong>{person.name}</strong>
                      <span className="helper-text" style={{display:"block"}}>{shortDate(person.birthDate)} · {person.city||"Cidade não informada"} · {person.origin==="cliente"?"Cadastro mestre":"Registro editorial"}</span>
                    </div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      <button className="cadastros-btn-secondary" type="button" disabled={busy}
                        onClick={()=>prepare(person.origin,person.id,Boolean(saved))}>
                        {busy?"Aguarde...":saved?"Trocar mensagem":"Preparar mensagem"}
                      </button>
                      {saved ? <button type="button" className="cadastros-btn-secondary" onClick={()=>void copyText(saved.message)}>Copiar</button>:null}
                    </div>
                  </div>
                  {saved ? <p style={{marginTop:10,whiteSpace:"pre-wrap"}}>{saved.message}</p>:null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="form-section">
        <h2>Familiares e aniversariantes editoriais</h2>
        {!manual.length ? <p className="helper-text">Nenhum registro editorial.</p> : (
          <div style={{display:"grid",gap:8,marginTop:12}}>
            {manual.map(person=>{
              const holder=person.group_client_id?clientMap.get(person.group_client_id):null;
              return <div className="aniv-entry" key={person.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",padding:10}}>
                <div>
                  <strong>{person.display_name}</strong>
                  <span className="helper-text" style={{display:"block"}}>
                    {String(person.birth_day).padStart(2,"0")}/{String(person.birth_month).padStart(2,"0")}
                    {person.city?" · "+person.city:""}
                    {holder?" · Vinculado a "+holder.name:""}
                    {" · "+(person.active?"Ativo":"Inativo")}
                    {" · "+(person.publish_in_print?"Publicação autorizada":"Fora da publicação")}
                  </span>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <button type="button" className="cadastros-btn-secondary" disabled={busy} onClick={()=>{setEditing(fromSaved(person));setError(null);}}>Editar</button>
                  <button type="button" className="cadastros-btn-secondary" disabled={busy} onClick={()=>changeStatus(person)}>{person.active?"Desativar":"Reativar"}</button>
                </div>
              </div>;
            })}
          </div>
        )}
      </section>

      {editing ? <section className="form-section">
        <h2>{editing.id?"Editar aniversariante editorial":"Novo aniversariante editorial"}</h2>
        <div className="cadastro-grid">
          <label className="cadastro-field cadastro-field--span-5"><span className="field-label">Nome</span>
            <input type="text" maxLength={180} required value={editing.displayName} onChange={e=>update("displayName",e.target.value)} /></label>
          <label className="cadastro-field cadastro-field--span-3"><span className="field-label">Nascimento</span>
            <input type="date" required value={editing.birthDate} onChange={e=>update("birthDate",e.target.value)} /></label>
          <label className="cadastro-field cadastro-field--span-4"><span className="field-label">Cidade</span>
            <input type="text" maxLength={120} value={editing.city} onChange={e=>update("city",e.target.value)} /></label>
          <label className="cadastro-field cadastro-field--span-6"><span className="field-label">Vínculo com cliente (opcional)</span>
            <select value={editing.groupClientId||""} onChange={e=>update("groupClientId",e.target.value||null)}>
              <option value="">Pessoa independente</option>
              {clients.map(c=><option value={c.id} key={c.id}>{c.name} ({c.kind==="company"?"Empresa":"Pessoa"})</option>)}
            </select></label>
          <label className="cadastro-field cadastro-field--span-6"><span className="field-label">Parentesco / função</span>
            <input type="text" maxLength={100} value={editing.relationship} onChange={e=>update("relationship",e.target.value)} /></label>
          <label className="cadastro-field cadastro-field--span-4"><span className="field-label">Profissão</span>
            <input type="text" maxLength={150} value={editing.profession} onChange={e=>update("profession",e.target.value)} /></label>
          <label className="cadastro-field cadastro-field--span-4"><span className="field-label">Organização</span>
            <input type="text" maxLength={180} value={editing.organization} onChange={e=>update("organization",e.target.value)} /></label>
          <label className="cadastro-field cadastro-field--span-4"><span className="field-label">Como é conhecido(a)</span>
            <input type="text" maxLength={120} value={editing.knownAs} onChange={e=>update("knownAs",e.target.value)} /></label>
          <label className="cadastro-field cadastro-field--span-6"><span className="field-label">Contexto para a mensagem (opcional)</span>
            <textarea maxLength={1500} rows={3} value={editing.messageContext} onChange={e=>update("messageContext",e.target.value)} /></label>
          <label className="cadastro-field cadastro-field--span-6"><span className="field-label">Observações</span>
            <textarea maxLength={1500} rows={3} value={editing.notes} onChange={e=>update("notes",e.target.value)} /></label>
        </div>
        <button type="button" role="switch" aria-checked={editing.publishInPrint}
          className={`switch-control${editing.publishInPrint?" is-on":""}`}
          onClick={()=>update("publishInPrint",!editing.publishInPrint)}>
          <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
          <span>Autorizar inclusão no jornal</span>
        </button>
        <div style={{display:"flex",gap:9,marginTop:14,flexWrap:"wrap"}}>
          <button type="button" className="cadastros-btn-primary" disabled={busy||!editing.displayName.trim()||!editing.birthDate} onClick={save}>
            {busy?"Salvando...":"Salvar no banco"}
          </button>
          <button type="button" className="cadastros-btn-secondary" disabled={busy} onClick={()=>setEditing(null)}>Cancelar</button>
        </div>
      </section> : null}
    </div>
  );
}
