"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
// Importações DIRETAS dos módulos-fonte de `@ir/pdf-extraction` (nunca o
// barril `@ir/pdf-extraction`/`index.ts`): o barril reexporta `extractPdf`,
// que carrega `pdfjsNode.ts` (Node puro — `createRequire`, `node:fs`) no
// escopo do módulo. Isso quebraria este componente de CLIENTE. Os dois
// arquivos abaixo são deliberadamente livres de qualquer dependência de
// Node (ver comentários nos próprios arquivos) — por isso é seguro
// importá-los direto daqui, reaproveitando o MESMO motor calibrado do
// extrator automático, em vez de duplicar a heurística de título/corpo.
import { extractPageTextItems, resolveRealFontNames } from "@ir/pdf-extraction/src/textItems";
import { extractArticleFromRegion, type RegionArticleExtraction } from "@ir/pdf-extraction/src/newspaper";
import type { TextItem } from "@ir/pdf-extraction";
import { combineAreaExtractions } from "./visualCaptureAreas";
import {
  filterItemsInRegion,
  normalizedRectToPoints,
  overlapRatio,
  rectFromPoints,
  selectionColor,
  type NormalizedRect,
} from "./visualCaptureRegion";
import styles from "./PdfVisualCaptureModal.module.css";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url).toString();

type Area = { page: number; rect: NormalizedRect };
type Capture = {
  id: string;
  color: string;
  areas: Area[];
  title: string;
  subtitle: string;
  body: string;
  needsReview: boolean;
  warnings: string[];
};

type Pointer = { x: number; y: number };
interface CaptureEdition {
  id: string;
  editionNumber: number;
  /** Verdadeiro quando a edição já tem PDF arquivado no R2 — habilita o fluxo online oficial. */
  hasArchivedPdf: boolean;
}
interface Props {
  edition: CaptureEdition;
  onClose: () => void;
}

interface PageTextInfo {
  items: TextItem[];
  pageWidth: number;
  pageHeight: number;
}

const MAX_LOCAL_PDF_BYTES = 100 * 1024 * 1024;
const MAX_ZOOM = 3;

function coloredStyle(rect: NormalizedRect, color: string): CSSProperties {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
    borderColor: color,
    backgroundColor: `${color}22`,
  };
}

function editionPdfUrl(editionId: string): string {
  return `/api/sistema/jornal-online/editions/${encodeURIComponent(editionId)}/pdf`;
}

/**
 * Captura visual de matérias — PRÉVIA, sem gravação (etapa 1).
 *
 * O operador vê o PDF OFICIAL já arquivado no R2 para esta edição (rota
 * autenticada `/api/sistema/jornal-online/editions/[id]/pdf`, exige sessão
 * e permissão editorial — nunca pública), página por página, com zoom, e
 * arrasta retângulos sobre cada matéria. O texto de cada seleção é extraído
 * pelo MESMO motor calibrado do extrator automático (`@ir/pdf-extraction`,
 * modo jornal), restrito aos itens daquela região — nunca uma heurística
 * paralela. Título/subtítulo/corpo ficam editáveis antes de qualquer uso
 * futuro; nada é criado, alterado ou apagado em `articles`,
 * `pdf_import_batches`/`pdf_import_candidates`, no R2 ou no Jornal Online.
 *
 * Um seletor de PDF local continua disponível como alternativa de teste
 * (ex.: conferir o comportamento com um PDF fora do acervo), mas o fluxo
 * principal é sempre o PDF já vinculado à edição.
 */
export function PdfVisualCaptureModal({ edition, onClose }: Props): JSX.Element {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [source, setSource] = useState<"r2" | "local" | null>(null);
  const [fileName, setFileName] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState({ width: 800, height: 1035 });
  const [fitScale, setFitScale] = useState(0.7);
  const [zoom, setZoom] = useState(1);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const createdCount = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [appendToId, setAppendToId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ from: Pointer; to: Pointer } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    edition.hasArchivedPdf
      ? "Carregando o PDF oficial desta edição…"
      : "Esta edição ainda não tem PDF arquivado no R2. Use \"PDF local (teste)\" para experimentar a ferramenta.",
  );
  const [closeConfirm, setCloseConfirm] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pageCache = useRef(new Map<number, PDFPageProxy>());
  const textCache = useRef(new Map<number, PageTextInfo>());
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const requestCounter = useRef(0);
  const dragRef = useRef<{ from: Pointer; to: Pointer } | null>(null);

  const scale = fitScale * zoom;
  const active = captures.find((item) => item.id === selectedId) ?? null;
  const draftRect = drag ? rectFromPoints(drag.from, drag.to) : null;
  const selectionsOnPage = captures.flatMap((capture) =>
    capture.areas
      .map((area, areaIndex) => ({ capture, area, areaIndex }))
      .filter(({ area }) => area.page === pageNumber),
  );

  useEffect(() => {
    pdfRef.current = pdf;
  }, [pdf]);
  useEffect(() => () => void pdfRef.current?.destroy(), []);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEsc = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (captures.length) setCloseConfirm(true);
        else onClose();
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onEsc);
    };
  }, [captures.length, onClose]);

  const getPage = useCallback(
    async (index: number): Promise<PDFPageProxy> => {
      const cached = pageCache.current.get(index);
      if (cached) return cached;
      if (!pdf) throw new Error("Carregue um PDF primeiro.");
      const page = await pdf.getPage(index);
      pageCache.current.set(index, page);
      return page;
    },
    [pdf],
  );

  /** Itens de texto da página (fonte real já resolvida) — uma vez por página, reaproveitado em toda seleção dentro dela. */
  const getPageTextInfo = useCallback(
    async (index: number): Promise<PageTextInfo> => {
      const cached = textCache.current.get(index);
      if (cached) return cached;
      const page = await getPage(index);
      // Carrega as fontes da página — resolveRealFontNames só enxerga o
      // nome real (negrito/itálico) depois disso (mesma ordem do pipeline
      // de extração automática).
      await page.getOperatorList().catch(() => undefined);
      const items = await extractPageTextItems(page);
      resolveRealFontNames(page, items);
      const viewport = page.getViewport({ scale: 1 });
      const info: PageTextInfo = { items, pageWidth: viewport.width, pageHeight: viewport.height };
      textCache.current.set(index, info);
      return info;
    },
    [getPage],
  );

  function resetDocumentState(nextSource: "r2" | "local"): void {
    setSource(nextSource);
    setPageNumber(1);
    setZoom(1);
    pageCache.current.clear();
    textCache.current.clear();
  }

  const openFromR2 = useCallback(async (): Promise<void> => {
    if (!edition.hasArchivedPdf) return;
    setBusy(true);
    setMessage("Carregando o PDF oficial desta edição…");
    try {
      const url = editionPdfUrl(edition.id);
      // HEAD primeiro: confirma sessão/permissão/existência com uma
      // mensagem clara ANTES de o pdf.js começar a baixar o arquivo.
      const probe = await fetch(url, { method: "HEAD" });
      if (!probe.ok) {
        let reason = `Não foi possível abrir o PDF desta edição (HTTP ${probe.status}).`;
        try {
          const body = (await (await fetch(url)).json()) as { error?: string };
          if (body?.error) reason = body.error;
        } catch {
          // mantém a mensagem genérica
        }
        throw new Error(reason);
      }
      const next = await getDocument({ url, withCredentials: true }).promise;
      const old = pdfRef.current;
      pdfRef.current = next;
      setPdf(next);
      setFileName(`Edição ${edition.editionNumber} — PDF oficial (R2)`);
      resetDocumentState("r2");
      setMessage(`PDF oficial carregado (${next.numPages} páginas). Arraste sobre uma matéria para selecionar.`);
      if (old) await old.destroy();
    } catch (error) {
      setMessage(
        (error instanceof Error ? error.message : "Não foi possível abrir o PDF desta edição.") +
          " Você pode tentar novamente ou usar \"PDF local (teste)\".",
      );
    } finally {
      setBusy(false);
    }
  }, [edition.hasArchivedPdf, edition.id, edition.editionNumber]);

  // Tenta o fluxo oficial automaticamente ao abrir o modal — o operador só
  // precisa do seletor local quando quiser testar com outro arquivo.
  useEffect(() => {
    if (edition.hasArchivedPdf) void openFromR2();
    // Executa só na montagem: reabrir manualmente usa os botões do cabeçalho.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openLocalFile(file: File | undefined): Promise<void> {
    if (!file) return;
    if (file.size > MAX_LOCAL_PDF_BYTES) {
      setMessage("PDF acima de 100 MB. Selecione uma edição menor.");
      return;
    }
    if (captures.length > 0) {
      setMessage("Feche esta prévia antes de trocar de PDF, para não perder seleções.");
      return;
    }
    setBusy(true);
    setMessage("Abrindo PDF local…");
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const next = await getDocument({ data }).promise;
      const old = pdfRef.current;
      pdfRef.current = next;
      setPdf(next);
      setFileName(file.name + " (teste local, fora do acervo)");
      resetDocumentState("local");
      setMessage(`PDF local carregado (${next.numPages} páginas). Arraste sobre uma matéria para selecionar.`);
      if (old) await old.destroy();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível abrir o PDF.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    void getPage(pageNumber)
      .then((page) => {
        if (cancelled) return;
        const vp = page.getViewport({ scale: 1 });
        setPageSize({ width: vp.width, height: vp.height });
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Erro ao abrir página.");
      });
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, getPage]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = (): void => {
      const w = Math.max(1, el.clientWidth - 28);
      const h = Math.max(1, el.clientHeight - 28);
      setFitScale(Math.min(w / pageSize.width, h / pageSize.height));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageSize.width, pageSize.height]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let task: ReturnType<PDFPageProxy["render"]> | null = null;
    const request = ++requestCounter.current;
    const render = async (): Promise<void> => {
      try {
        const page = await getPage(pageNumber);
        const canvas = canvasRef.current;
        if (!canvas || cancelled || request !== requestCounter.current) return;
        const context = canvas.getContext("2d");
        if (!context) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const vp = page.getViewport({ scale: scale * ratio });
        canvas.width = Math.max(1, Math.ceil(vp.width));
        canvas.height = Math.max(1, Math.ceil(vp.height));
        task = page.render({ canvasContext: context, viewport: vp });
        await task.promise;
      } catch (error) {
        if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
          setMessage("A renderização desta página falhou. Tente reduzir o zoom.");
        }
      }
    };
    void render();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, getPage, scale]);

  function pointFromEvent(event: PointerEvent<HTMLDivElement>): Pointer {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: clamp01Local((event.clientX - box.left) / box.width), y: clamp01Local((event.clientY - box.top) / box.height) };
  }
  function clamp01Local(value: number): number {
    return Math.max(0, Math.min(1, value));
  }
  function begin(event: PointerEvent<HTMLDivElement>): void {
    if (!pdf || busy || event.button !== 0) return;
    const point = pointFromEvent(event);
    dragRef.current = { from: point, to: point };
    setDrag(dragRef.current);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>): void {
    if (!dragRef.current) return;
    const next = { ...dragRef.current, to: pointFromEvent(event) };
    dragRef.current = next;
    setDrag(next);
  }

  async function finish(event: PointerEvent<HTMLDivElement>): Promise<void> {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!current || !pdf) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const rect = rectFromPoints(current.from, pointFromEvent(event));
    if (rect.width < 0.014 || rect.height < 0.014) return;
    const existingOnPage = selectionsOnPage.map(({ area }) => area.rect);
    if (existingOnPage.some((other) => overlapRatio(other, rect) > 0.85)) {
      setMessage("Esta área já foi selecionada. Ajuste o retângulo para evitar duplicação.");
      return;
    }
    setBusy(true);
    try {
      const info = await getPageTextInfo(pageNumber);
      const rectPoints = normalizedRectToPoints(rect, info.pageWidth, info.pageHeight);
      const regionItems = filterItemsInRegion(info.items, rectPoints);
      if (regionItems.length === 0) {
        setMessage("Não há texto reconhecível nessa região. Fotografias ficam de fora da captura textual.");
        return;
      }
      const extraction: RegionArticleExtraction = extractArticleFromRegion(regionItems, rectPoints.width, rectPoints.height);
      const label = `Página ${pageNumber}`;

      if (appendToId) {
        setCaptures((prev) =>
          prev.map((capture) => {
            if (capture.id !== appendToId) return capture;
            const extraParts: string[] = [];
            if (extraction.title) extraParts.push(extraction.title);
            if (extraction.subtitle) extraParts.push(extraction.subtitle);
            extraParts.push(...extraction.bodyParagraphs);
            const newWarnings = extraction.warnings.map((warning) => `${label}: ${warning}`);
            if (extraction.title) {
              newWarnings.push(`${label}: um título foi reconhecido nesta área além da primeira — confira se pertence à mesma matéria.`);
            }
            return {
              ...capture,
              areas: [...capture.areas, { page: pageNumber, rect }],
              body: [capture.body.trim(), extraParts.join("\n\n")].filter(Boolean).join("\n\n"),
              needsReview: capture.needsReview || extraction.needsReview || Boolean(extraction.title),
              warnings: [...capture.warnings, ...newWarnings],
            };
          }),
        );
        setSelectedId(appendToId);
        setAppendToId(null);
        setMessage("Trecho acrescentado à matéria selecionada. Confira o texto na lateral.");
        return;
      }

      const combined = combineAreaExtractions([extraction], [label]);
      const id = crypto.randomUUID();
      const color = selectionColor(createdCount.current++);
      setCaptures((prev) => [
        ...prev,
        {
          id,
          color,
          areas: [{ page: pageNumber, rect }],
          title: combined.title,
          subtitle: combined.subtitle,
          body: combined.bodyParagraphs.join("\n\n"),
          needsReview: combined.needsReview,
          warnings: combined.warnings,
        },
      ]);
      setSelectedId(id);
      setMessage(
        combined.title
          ? "Área selecionada. Confira e ajuste título, subtítulo e texto na lateral."
          : "Área selecionada, mas nenhum título foi reconhecido — confira/preencha manualmente.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao extrair texto da seleção.");
    } finally {
      setBusy(false);
    }
  }

  function editCapture(field: "title" | "subtitle" | "body", text: string): void {
    setCaptures((prev) => prev.map((capture) => (capture.id === selectedId ? { ...capture, [field]: text } : capture)));
  }
  function deleteCapture(id: string): void {
    setCaptures((prev) => prev.filter((capture) => capture.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (appendToId === id) setAppendToId(null);
  }
  function exportPreview(): void {
    const record = {
      format: "ir-visual-capture-preview-v1",
      editionId: edition.id,
      editionNumber: edition.editionNumber,
      source,
      fileName,
      pageCount: pdf?.numPages ?? 0,
      note: "Prévia local — nenhum registro foi criado no Supabase, R2 ou Jornal Online.",
      captures,
    };
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `edicao-${edition.editionNumber}-pre-captura.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function requestClose(): void {
    if (captures.length) setCloseConfirm(true);
    else onClose();
  }

  const pageCounter = useMemo(
    () => captures.filter((capture) => capture.areas.some((area) => area.page === pageNumber)).length,
    [captures, pageNumber],
  );

  return (
    <div className={styles.backdrop} role="presentation">
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="capture-title">
        <header className={styles.header}>
          <div className={styles.headline}>
            <h2 id="capture-title">Capturar matérias — edição {edition.editionNumber}</h2>
            <p>Prévia visual · não grava rascunhos nem altera o Jornal Online</p>
          </div>
          <div className={styles.headerActions}>
            {edition.hasArchivedPdf ? (
              <button type="button" onClick={() => void openFromR2()} disabled={busy || captures.length > 0}>
                Reabrir PDF oficial
              </button>
            ) : null}
            <button type="button" onClick={() => fileInput.current?.click()} disabled={busy || captures.length > 0}>
              PDF local (teste)
            </button>
            <input
              ref={fileInput}
              className={styles.hidden}
              type="file"
              accept="application/pdf,.pdf"
              aria-label="Selecionar PDF local para teste"
              onChange={(event) => {
                void openLocalFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button type="button" className={styles.close} onClick={requestClose} aria-label="Fechar modal">
              ✕
            </button>
          </div>
        </header>

        <div className={styles.controls}>
          <div className={styles.pager}>
            <button type="button" disabled={!pdf || pageNumber <= 1 || busy} onClick={() => setPageNumber((n) => n - 1)} aria-label="Página anterior">
              ←
            </button>
            <span>
              Página {pdf ? pageNumber : "—"} de {pdf?.numPages ?? "—"}
            </span>
            <button
              type="button"
              disabled={!pdf || pageNumber >= pdf.numPages || busy}
              onClick={() => setPageNumber((n) => n + 1)}
              aria-label="Próxima página"
            >
              →
            </button>
          </div>
          <div className={styles.pager}>
            <button type="button" onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.25).toFixed(2)))} disabled={!pdf || zoom <= 0.7} aria-label="Reduzir zoom">
              −
            </button>
            <span>Zoom {Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.25).toFixed(2)))} disabled={!pdf || zoom >= MAX_ZOOM} aria-label="Ampliar zoom">
              +
            </button>
            <button type="button" onClick={() => setZoom(1)} disabled={!pdf}>
              Ajustar
            </button>
          </div>
        </div>

        <div className={styles.workspace}>
          <main className={styles.viewer} aria-label="Página do PDF">
            <div className={styles.viewerScroll} ref={viewportRef}>
              {pdf ? (
                <div className={styles.page} style={{ width: pageSize.width * scale, height: pageSize.height * scale }}>
                  <canvas className={styles.canvas} ref={canvasRef} style={{ width: "100%", height: "100%" }} aria-label={`Página ${pageNumber}`} />
                  {selectionsOnPage.map(({ capture, area, areaIndex }, position) => {
                    const captureIndex = captures.findIndex((item) => item.id === capture.id);
                    return (
                      <div key={`${capture.id}-${areaIndex}-${position}`} className={styles.selection} style={coloredStyle(area.rect, capture.color)}>
                        <span className={styles.selectionNumber} style={{ background: capture.color }}>
                          {captureIndex + 1}
                        </span>
                      </div>
                    );
                  })}
                  {draftRect ? (
                    <div
                      className={styles.drawing}
                      style={coloredStyle(draftRect, appendToId ? captures.find((c) => c.id === appendToId)?.color ?? "#0284c7" : "#0284c7")}
                    />
                  ) : null}
                  <div
                    className={styles.pointerLayer}
                    onPointerDown={begin}
                    onPointerMove={move}
                    onPointerUp={(event) => void finish(event)}
                    onPointerCancel={() => {
                      dragRef.current = null;
                      setDrag(null);
                    }}
                    aria-label="Arraste para selecionar uma área de matéria"
                  />
                </div>
              ) : (
                <div className={styles.empty}>
                  <strong>{busy ? "Carregando…" : `Abra o PDF da edição ${edition.editionNumber}`}</strong>
                  <p>Uma página por vez, com zoom e seleções coloridas. Nenhum arquivo é enviado — a leitura é direta do acervo.</p>
                </div>
              )}
            </div>
          </main>
          <aside className={styles.sidebar} aria-label="Matérias capturadas">
            <div className={styles.sidebarHead}>
              <strong>Matérias selecionadas ({captures.length})</strong>
              <small>{pageCounter} nesta página</small>
            </div>
            <div className={styles.selectionList} role="list">
              {captures.length === 0 ? (
                <p className={styles.helper}>Arraste um retângulo sobre cada matéria. A lista aparecerá aqui, com cor e título sugerido.</p>
              ) : null}
              {captures.map((capture, index) => (
                <div key={capture.id} role="listitem" className={`${styles.listRow} ${selectedId === capture.id ? styles.selectedRow : ""}`}>
                  <button
                    type="button"
                    className={styles.listItemButton}
                    onClick={() => {
                      setSelectedId(capture.id);
                      setPageNumber(capture.areas[0].page);
                    }}
                  >
                    <span className={styles.swatch} style={{ background: capture.color }}>
                      {index + 1}
                    </span>
                    <span className={styles.listText}>
                      <strong>{capture.title || "Título não reconhecido"}</strong>
                      <small>
                        Pág. {Array.from(new Set(capture.areas.map((area) => area.page))).join(", ")} · {capture.areas.length} área(s)
                        {capture.needsReview ? " · revisar" : ""}
                      </small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => deleteCapture(capture.id)}
                    title="Remover seleção desta prévia"
                    aria-label={`Remover seleção ${index + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {active ? (
              <div className={styles.editor}>
                {active.warnings.length > 0 ? (
                  <ul className={styles.warningList}>
                    {active.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                <label>
                  Título
                  <input value={active.title} onChange={(event) => editCapture("title", event.target.value)} />
                </label>
                <label>
                  Subtítulo
                  <input value={active.subtitle} onChange={(event) => editCapture("subtitle", event.target.value)} placeholder="Opcional" />
                </label>
                <label>
                  Corpo capturado
                  <textarea rows={5} value={active.body} onChange={(event) => editCapture("body", event.target.value)} />
                </label>
                <button
                  type="button"
                  className={appendToId === active.id ? styles.appendActive : ""}
                  onClick={() => setAppendToId((id) => (id === active.id ? null : active.id))}
                >
                  {appendToId === active.id ? "Cancelar inclusão de trecho" : "+ Incluir outro trecho nesta matéria"}
                </button>
              </div>
            ) : null}
          </aside>
        </div>

        <footer className={styles.footer}>
          <p role="status" aria-live="polite">
            {busy ? "Processando… " : ""}
            {message}
          </p>
          <div className={styles.footerActions}>
            <button type="button" onClick={requestClose}>
              Fechar
            </button>
            <button type="button" disabled={!captures.length} onClick={exportPreview}>
              Exportar prévia JSON ({captures.length})
            </button>
          </div>
        </footer>

        {closeConfirm ? (
          <div className={styles.confirmBackdrop}>
            <div className={styles.confirmBox} role="alertdialog" aria-modal="true" aria-label="Descartar prévia">
              <h3>Fechar e descartar seleções?</h3>
              <p>A prévia não foi gravada em nenhum lugar. Exporte o JSON antes de fechar, se quiser guardar o trabalho.</p>
              <div>
                <button type="button" onClick={() => setCloseConfirm(false)}>
                  Continuar editando
                </button>
                <button type="button" onClick={onClose}>
                  Descartar prévia
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
