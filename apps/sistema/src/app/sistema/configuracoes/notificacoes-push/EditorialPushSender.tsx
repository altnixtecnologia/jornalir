"use client";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { enqueueSitePushAction } from "./actions";
import { notify } from "../../../../lib/feedback/notify";

export interface EditorialPushPrefill {
  title: string;
  body: string;
  href: string;
  kind: "ordinary" | "urgent";
}

export function EditorialPushSender({ prefill, enabled, eligibleByKind }: {
  prefill?: EditorialPushPrefill;
  enabled: boolean;
  eligibleByKind: { ordinary: number; urgent: number };
}): JSX.Element {
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<"ordinary" | "urgent">(prefill?.kind ?? "ordinary");
  const eligibleCount = eligibleByKind[kind];
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [body, setBody] = useState(prefill?.body ?? "");
  const [href, setHref] = useState(prefill?.href ?? "");
  const [requestId, setRequestId] = useState("");
  useEffect(() => setRequestId(crypto.randomUUID()), []);

  function submit(event: FormEvent<HTMLFormElement>, confirmDuplicate = false): void {
    event.preventDefault();
    if (pending || !requestId || !enabled || eligibleCount === 0) return;
    if (kind === "urgent" && !confirmDuplicate && !window.confirm("Confirmar notificação URGENTE para os leitores inscritos?")) return;
    const data = new FormData();
    data.set("kind", kind);
    data.set("title", title);
    data.set("body", body);
    data.set("href", href);
    data.set("request_id", requestId);
    if (confirmDuplicate) data.set("confirm_duplicate", "1");
    startTransition(async () => {
      let result = await enqueueSitePushAction(data);
      if (result.needsDuplicateConfirm) {
        if (!window.confirm((result.error || "Esta matéria já foi notificada.") + " Enviar mesmo assim?")) {
          notify.warning("Envio cancelado", "A matéria já havia sido notificada automaticamente.");
          return;
        }
        // A confirmação ocorre dentro da mesma transição. Chamar submit()
        // novamente aqui falharia porque pending ainda está true.
        data.set("confirm_duplicate", "1");
        result = await enqueueSitePushAction(data);
      }
      if (result.error) {
        notify.error("Aviso não enviado", result.error);
        return;
      }
      notify.success("Aviso preparado", "Incluído na fila, ainda não entregue. Acompanhe as entregas no painel de notificações.");
      setRequestId(crypto.randomUUID());
      setTitle("");
      setBody("");
      setHref("");
    });
  }
  return (
    <form className="form-section" onSubmit={submit}>
      <p className="helper-text">
        A publicação da matéria NÃO envia este aviso. O disparo é separado e manual,
        depende de dispositivos inscritos, agendador ativo e liberação após homologação.
        O sistema exige confirmação adicional para notícias urgentes.
      </p>
      <p className="helper-text" role="status">
        {enabled
          ? `Inscritos elegíveis: ${eligibleCount}. O aviso só poderá ser preparado se houver pelo menos um destinatário.`
          : "Envio temporariamente desativado para homologação. Nenhuma notificação será disparada por esta tela."}
      </p>
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
        <input value={href} maxLength={500} required onChange={(event) => setHref(event.target.value)} disabled={pending} placeholder="/noticias/exemplo" />
      </label>
      <button type="submit" className="form-action-primary" disabled={pending || !requestId || !enabled || eligibleCount === 0}>{pending ? "Preparando..." : kind === "urgent" ? "Preparar aviso urgente" : "Preparar notificação"}</button>
    </form>
  );
}
