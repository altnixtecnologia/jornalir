"use client";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { enqueueSitePushAction } from "./actions";

export function EditorialPushSender(): JSX.Element {
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<"ordinary" | "urgent">("ordinary");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [href, setHref] = useState("/");
  const [requestId, setRequestId] = useState("");
  useEffect(() => setRequestId(crypto.randomUUID()), []);
  const [message, setMessage] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pending || !requestId) return;
    if (kind === "urgent" && !window.confirm("Confirmar notificação URGENTE para os leitores inscritos?")) return;
    const data = new FormData();
    data.set("kind", kind);
    data.set("title", title);
    data.set("body", body);
    data.set("href", href);
    data.set("request_id", requestId);
    setMessage(null);
    startTransition(async () => {
      const result = await enqueueSitePushAction(data);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setMessage("Notificação incluída na fila. Apenas dispositivos inscritos e que autorizaram este tipo poderão recebê-la.");
      setRequestId(crypto.randomUUID());
      setTitle("");
      setBody("");
      setHref("/");
    });
  }
  return (
    <form className="form-section" onSubmit={submit}>
      <p className="helper-text">A ação é manual. Nenhuma matéria é enviada automaticamente ao publicar. O envio requer inscritos e o agendador push ativo.</p>
      <label className="form-field">
        <span className="field-label">Tipo de notificação</span>
        <select value={kind} onChange={(event) => setKind(event.target.value as "ordinary" | "urgent")} disabled={pending}>
          <option value="ordinary">Notícia comum</option>
          <option value="urgent">Notícia urgente</option>
        </select>
      </label>
      <label className="form-field">
        <span className="field-label">Título</span>
        <input value={title} maxLength={110} required onChange={(event) => setTitle(event.target.value)} disabled={pending} />
      </label>
      <label className="form-field">
        <span className="field-label">Mensagem</span>
        <textarea value={body} maxLength={320} required rows={3} onChange={(event) => setBody(event.target.value)} disabled={pending} />
      </label>
      <label className="form-field">
        <span className="field-label">Link interno da notícia</span>
        <input value={href} maxLength={500} required onChange={(event) => setHref(event.target.value)} disabled={pending} placeholder="/noticia/exemplo" />
      </label>
      <button type="submit" className="form-action-primary" disabled={pending || !requestId}>{pending ? "Preparando..." : kind === "urgent" ? "Preparar aviso urgente" : "Preparar notificação"}</button>
      {message ? <p role="status" className="helper-text">{message}</p> : null}
    </form>
  );
}
