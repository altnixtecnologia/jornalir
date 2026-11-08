"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import {
  getSignatureFieldLayoutAction,
  removeSignatureFieldLayoutAction,
  saveSignatureFieldLayoutAction,
} from "../../app/sistema/contratos-assinatura/actions";
import { getContractTemplateDocumentUrlAction } from "../../app/sistema/financeiro/modelos-contrato/actions";
import type { FieldKind, PlacedField } from "../../lib/signatures/signaturePlacement";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url).toString();

const SIGNERS = [
  { key: "contratada-1", label: "Empresa / representante 1" },
  { key: "contratada-2", label: "Empresa / representante 2 (conjunta)" },
  { key: "contratada-3", label: "Empresa / representante 3" },
  { key: "contratada-4", label: "Empresa / representante 4" },
  { key: "contratada-5", label: "Empresa / representante 5" },
  { key: "contratante-1", label: "Cliente / contratante" },
] as const;

const FIELD_TYPES: Array<{ key: FieldKind; label: string }> = [
  { key: "signature", label: "Assinatura" },
  { key: "initials", label: "Rubrica" },
  { key: "datetime", label: "Data e horário" },
];

type DrawState = { page: number; x: number; y: number; x2: number; y2: number };
type Point = { x: number; y: number };

function bounded(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function rectStyle(field: Pick<PlacedField, "x" | "y" | "width" | "height">): CSSProperties {
  return {
    position: "absolute",
    left: String(field.x * 100) + "%",
    top: String(field.y * 100) + "%",
    width: String(field.width * 100) + "%",
    height: String(field.height * 100) + "%",
    pointerEvents: "none",
  };
}

function PagePreview({
  pdf, pageNumber, fields, draft, onStart, onMove, onFinish, onCancel,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  fields: PlacedField[];
  draft: DrawState | null;
  onStart: (page: number, point: Point) => void;
  onMove: (page: number, point: Point) => void;
  onFinish: (page: number, point: Point) => void;
  onCancel: () => void;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: ReturnType<Awaited<ReturnType<typeof pdf.getPage>>["render"]> | undefined;
    async function drawPage(): Promise<void> {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(740 / natural.width, 1.3) });
      const ratio = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 2);
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = String(viewport.width) + "px";
      canvas.style.height = String(viewport.height) + "px";
      setSize({ width: viewport.width, height: viewport.height });
      const context = canvas.getContext("2d");
      if (!context) return;
      renderTask = page.render({ canvasContext: context, viewport: page.getViewport({ scale: Math.min(740 / natural.width, 1.3) * ratio }) });
      await renderTask.promise;
    }
    void drawPage().catch((error) => {
      if (!cancelled && (error as Error).name !== "RenderingCancelledException") console.error("Falha ao exibir página do PDF");
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageNumber]);

  function point(event: PointerEvent<HTMLDivElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: bounded((event.clientX - bounds.left) / bounds.width),
      y: bounded((event.clientY - bounds.top) / bounds.height),
    };
  }

  const active = draft && draft.page === pageNumber ? {
    x: Math.min(draft.x, draft.x2),
    y: Math.min(draft.y, draft.y2),
    width: Math.abs(draft.x - draft.x2),
    height: Math.abs(draft.y - draft.y2),
  } : null;

  return (
    <div style={{ margin: "0 auto 20px", width: "fit-content", maxWidth: "100%" }}>
      <div className="helper-text" style={{ marginBottom: 4 }}>Página {pageNumber}</div>
      <div style={{ position: "relative", border: "1px solid #94a3b8", maxWidth: "100%", width: size?.width, height: size?.height }}>
        <canvas ref={canvasRef} style={{ display: "block", maxWidth: "100%", height: "auto", background: "white" }} />
        {size ? (
          <div
            aria-label={"Desenhar campo de assinatura ou rubrica na página " + pageNumber}
            role="application"
            style={{ position: "absolute", inset: 0, cursor: "crosshair", touchAction: "none" }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              onStart(pageNumber, point(event));
            }}
            onPointerMove={(event) => { if (event.buttons === 1) onMove(pageNumber, point(event)); }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
              onFinish(pageNumber, point(event));
            }}
            onPointerCancel={onCancel}
          >
            {fields.filter((field) => field.page === pageNumber).map((field, index) => {
              const company = field.signerKey.startsWith("contratada");
              return <div key={field.signerKey + field.kind + index} style={{
                ...rectStyle(field),
                boxSizing: "border-box", border: "2px solid " + (company ? "#dc2626" : "#2563eb"),
                background: company ? "#fee2e266" : "#dbeafe77",
                fontWeight: 700, fontSize: 11, color: company ? "#991b1b" : "#1d4ed8", overflow: "hidden",
              }}>
                {field.kind === "initials" ? "Rubrica" : field.kind === "datetime" ? "Data" : "Assinatura"} {company ? "Empresa" : "Cliente"}
              </div>;
            })}
            {active ? <div style={{ ...rectStyle(active), background: "#fbbf2444", border: "2px dashed #d97706", boxSizing: "border-box" }} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Edição visual inspirada no fluxo funcional do NixSign:
 * abrir PDF, selecionar signatário/campo, desenhar o retângulo na página,
 * conferir e salvar por versão do modelo. NÃO assina o documento.
 */
export function SignatureFieldLayoutEditor({
  templateId, title, version, onClose,
}: { templateId: string; title: string; version: number; onClose: () => void }): JSX.Element {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [signerKey, setSignerKey] = useState<string>("contratada-1");
  const [kind, setKind] = useState<FieldKind>("signature");
  const [draft, setDraft] = useState<DrawState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let disposed = false;
    let loaded: PDFDocumentProxy | null = null;
    async function openPdf(): Promise<void> {
      const [url, saved] = await Promise.all([
        getContractTemplateDocumentUrlAction(templateId),
        getSignatureFieldLayoutAction(templateId),
      ]);
      if ("error" in url) throw new Error(url.error);
      if ("error" in saved) throw new Error(saved.error);
      const response = await fetch(url.url, { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível carregar o PDF privado.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      loaded = await getDocument({ data: bytes }).promise;
      if (disposed) { await loaded.destroy(); return; }
      setPdf(loaded);
      setFields(saved.fields);
    }
    void openPdf().catch((cause) => {
      if (!disposed) setError(cause instanceof Error ? cause.message : "Não foi possível abrir o PDF.");
    });
    return () => { disposed = true; void loaded?.destroy(); };
  }, [templateId]);

  function onStart(page: number, at: Point): void {
    setError(""); setNotice("");
    setDraft({ page, x: at.x, y: at.y, x2: at.x, y2: at.y });
  }
  function onMove(page: number, at: Point): void {
    setDraft((current) => current?.page === page ? { ...current, x2: at.x, y2: at.y } : current);
  }
  function onFinish(page: number, at: Point): void {
    if (!draft || draft.page !== page) return;
    const next: PlacedField = {
      signerKey, kind, page,
      x: Math.min(draft.x, at.x), y: Math.min(draft.y, at.y),
      width: Math.abs(draft.x - at.x), height: Math.abs(draft.y - at.y),
    };
    setDraft(null);
    if (next.width < 0.025 || next.height < 0.025) {
      setError("Desenhe um retângulo maior. Clique em uma extremidade e arraste até a outra.");
      return;
    }
    setFields((previous) => [
      ...previous.filter((field) => !(field.signerKey === signerKey && field.kind === kind && (
        kind === "signature" || field.page === page
      ))),
      next,
    ]);
  }

  async function save(): Promise<void> {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await saveSignatureFieldLayoutAction(templateId, fields);
      if ("error" in result) throw new Error(result.error);
      setNotice("Posições salvas nesta versão do modelo. A assinatura só será aplicada após a confirmação eletrônica.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar as posições.");
    } finally {
      setBusy(false);
    }
  }

  async function useAutomatic(): Promise<void> {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await removeSignatureFieldLayoutAction(templateId);
      if ("error" in result) throw new Error(result.error);
      setFields([]);
      setNotice("Layout manual removido. O sistema utilizará rubricas automáticas e folha final de assinaturas.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível voltar ao automático.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={"Posicionamento de assinaturas do modelo " + title}
      style={{ position: "fixed", inset: 8, zIndex: 1050, background: "#f8fafc", color: "#0f172a", overflow: "auto", padding: 16, borderRadius: 10, boxShadow: "0 12px 40px #0004" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 3, background: "#f8fafc", paddingBottom: 12, borderBottom: "1px solid #cbd5e1" }}>
        <h2 style={{ margin: "0 0 8px" }}>Posicionar assinaturas e rubricas — {title} (v{version})</h2>
        <p className="helper-text">Como no NixSign: escolha a parte e o tipo de campo; desenhe a área diretamente sobre a página do PDF. Vermelho: empresa. Azul: cliente. Nada é assinado nesta tela.</p>
        <div className="form-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <label>Parte
            <select value={signerKey} onChange={(event) => setSignerKey(event.target.value)}>
              {SIGNERS.map((signer) => <option key={signer.key} value={signer.key}>{signer.label}</option>)}
            </select>
          </label>
          <label>Campo
            <select value={kind} onChange={(event) => setKind(event.target.value as FieldKind)}>
              {FIELD_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
            </select>
          </label>
          <button type="button" className="form-action-primary" disabled={!pdf || busy} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar posições"}</button>
          <button type="button" disabled={!pdf || busy} onClick={() => void useAutomatic()}>Usar posicionamento automático</button>
          <button type="button" onClick={onClose}>Fechar</button>
        </div>
        {error ? <p role="alert" style={{ color: "#b91c1c" }}>{error}</p> : null}
        {notice ? <p role="status" style={{ color: "#166534" }}>{notice}</p> : null}
      </div>

      {!pdf && !error ? <p role="status">Abrindo documento e posições salvas…</p> : null}
      {pdf ? (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16, alignItems: "start" }}>
          <div style={{ flex: "1 1 640px", minWidth: 0, maxHeight: "75vh", overflowY: "auto", background: "#e2e8f0", padding: 8 }}>
            {Array.from({ length: pdf.numPages }, (_, index) => (
              <PagePreview key={index + 1} pdf={pdf} pageNumber={index + 1} fields={fields} draft={draft}
                onStart={onStart} onMove={onMove} onFinish={onFinish} onCancel={() => setDraft(null)} />
            ))}
          </div>
          <div style={{ flex: "0 1 310px", maxHeight: "75vh", overflowY: "auto" }}>
            <h3>Campos posicionados ({fields.length})</h3>
            <p className="helper-text">Um campo de assinatura por parte. As rubricas podem aparecer em várias páginas. Para representação conjunta, inclua também a assinatura da segunda pessoa.</p>
            {fields.length === 0 ? <p>Nenhum campo manual. O posicionamento automático continuará disponível.</p> : (
              <ul style={{ listStyle: "none", padding: 0 }}>
                {fields.map((field, index) => (
                  <li key={index} style={{ display: "flex", justifyContent: "space-between", gap: 8, borderBottom: "1px solid #cbd5e1", padding: "7px 0" }}>
                    <span>{field.signerKey.startsWith("contratada") ? "Empresa" : "Cliente"} · {field.kind === "initials" ? "Rubrica" : field.kind === "datetime" ? "Data/hora" : "Assinatura"} · pág. {field.page}</span>
                    <button type="button" disabled={busy} onClick={() => setFields((current) => current.filter((_, i) => i !== index))}>Remover</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
