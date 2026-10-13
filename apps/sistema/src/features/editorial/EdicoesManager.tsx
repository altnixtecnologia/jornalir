"use client";

import { useRef, useState, useTransition } from "react";
import type { NewspaperEdition } from "@ir/types";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import {
  abandonEditionR2UploadAction,
  createEdition,
  finalizeEditionR2UploadAction,
  prepareEditionR2UploadAction,
  setEditionActive,
  updateEdition,
  type NewspaperEditionPayload,
} from "../../app/sistema/editorial/edicoes/actions";
import { editionLabel, formatDate } from "./editorialLabels";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url).toString();

interface EdicoesManagerProps {
  editions: NewspaperEdition[];
}

const EMPTY_FORM: NewspaperEditionPayload = {
  editionNumber: "",
  title: "",
  publicationDate: "",
  pageCount: "",
};

function toFormValues(edition: NewspaperEdition): NewspaperEditionPayload {
  return {
    editionNumber: String(edition.editionNumber),
    title: edition.title,
    publicationDate: edition.publicationDate,
    pageCount: edition.pageCount?.toString() ?? "",
  };
}

/**
 * Gestão de edições do jornal (Fase 28) — cadastro/edição real, sempre a
 * partir de `NewspaperEditionService`. Nunca exclusão destrutiva: inativar
 * é a única remoção pela UI (uma edição já referenciada por matérias/
 * candidatos de importação nunca pode sumir de baixo delas).
 */
export function EdicoesManager({ editions }: EdicoesManagerProps): JSX.Element {
  const [items, setItems] = useState(editions);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<NewspaperEditionPayload>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<NewspaperEditionPayload>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const sorted = [...items].sort((a, b) => b.editionNumber - a.editionNumber);

  function startEdit(edition: NewspaperEdition): void {
    setError(null);
    setShowCreate(false);
    setEditingId(edition.id);
    setEditForm(toFormValues(edition));
  }

  function handleCreate(): void {
    setError(null);
    startTransition(async () => {
      const result = await createEdition(createForm);
      if ("error" in result) {
        setError(result.error);
      } else {
        setItems((prev) => [...prev, result.edition]);
        setCreateForm(EMPTY_FORM);
        setShowCreate(false);
      }
    });
  }

  function handleSaveEdit(id: string): void {
    setError(null);
    startTransition(async () => {
      const result = await updateEdition(id, editForm);
      if ("error" in result) {
        setError(result.error);
      } else {
        setItems((prev) => prev.map((item) => (item.id === id ? result.edition : item)));
        setEditingId(null);
      }
    });
  }

  function handleToggleActive(edition: NewspaperEdition): void {
    setError(null);
    startTransition(async () => {
      const result = await setEditionActive(edition.id, !edition.active);
      if ("error" in result) {
        setError(result.error);
      } else {
        setItems((prev) => prev.map((item) => (item.id === edition.id ? result.edition : item)));
      }
    });
  }

  async function analyzePdf(file: File): Promise<{
    sha256: string;
    pageCount: number;
    cover: Blob;
  }> {
    const bytes = await file.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(hash))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");

    const pdf = await getDocument({ data: new Uint8Array(bytes) }).promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.max(1, Math.min(2, 960 / base.width));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a capa da edição.");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;

    const cover = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível gerar a capa WebP."))),
        "image/webp",
        0.86,
      );
    });

    return { sha256, pageCount: pdf.numPages, cover };
  }

  function handlePdfSelected(editionId: string, event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setUploadingId(editionId);
    setUploadStage("Preparando PDF e capa…");

    startTransition(async () => {
      let plan: Awaited<ReturnType<typeof prepareEditionR2UploadAction>> extends { ok: true; plan: infer P } ? P : never;
      try {
        const prepared = await analyzePdf(file);
        setUploadStage(`PDF validado · ${prepared.pageCount} páginas · preparando R2…`);

        const authorization = await prepareEditionR2UploadAction(editionId, file.name, file.size);
        if ("error" in authorization) {
          setError(authorization.error);
          return;
        }
        plan = authorization.plan;

        setUploadStage("Enviando PDF diretamente ao R2…");
        const pdfResponse = await fetch(plan.pdf.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: file,
        });
        if (!pdfResponse.ok) throw new Error(`Falha no upload do PDF para o R2 (HTTP ${pdfResponse.status}).`);

        setUploadStage("Enviando capa…");
        const coverResponse = await fetch(plan.cover.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "image/webp" },
          body: prepared.cover,
        });
        if (!coverResponse.ok) throw new Error(`Falha no upload da capa para o R2 (HTTP ${coverResponse.status}).`);

        setUploadStage("Validando arquivo no servidor…");
        const finalized = await finalizeEditionR2UploadAction(editionId, {
          pdfKey: plan.pdf.key,
          coverKey: plan.cover.key,
          fileName: file.name,
          fileSize: file.size,
          sha256: prepared.sha256,
          pageCount: prepared.pageCount,
        });

        if ("error" in finalized) {
          setError(finalized.error);
          return;
        }

        setItems((prev) => prev.map((item) => (item.id === editionId ? finalized.edition : item)));
        setUploadStage("PDF e capa publicados no R2.");
        window.setTimeout(() => setUploadStage(null), 2500);
      } catch (uploadError) {
        if (plan) {
          await abandonEditionR2UploadAction(editionId, plan.pdf.key, plan.cover.key);
        }
        setError(uploadError instanceof Error ? uploadError.message : "Não foi possível enviar a edição.");
      } finally {
        setUploadingId(null);
      }
    });
  }

  function renderPdfCell(edition: NewspaperEdition): JSX.Element {
    const isUploading = uploadingId === edition.id;
    return (
      <div className="media-upload-actions">
        {edition.pdfUrl ? (
          <a className="text-link" href={edition.pdfUrl} target="_blank" rel="noreferrer">
            Ver PDF
          </a>
        ) : (
          <span className="helper-text">Sem PDF</span>
        )}
        <button
          type="button"
          onClick={() => fileInputRefs.current[edition.id]?.click()}
          disabled={pending || isUploading}
        >
          {isUploading ? "Enviando…" : edition.pdfUrl ? "Trocar PDF" : "Enviar ao Jornal Online"}
        </button>
        <input
          ref={(element) => {
            fileInputRefs.current[edition.id] = element;
          }}
          type="file"
          accept="application/pdf"
          className="visually-hidden"
          onChange={(event) => handlePdfSelected(edition.id, event)}
        />
      </div>
    );
  }

  return (
    <>
      <div className="materias-toolbar">
        <span className="materias-count">{items.length} edição(ões)</span>
        <button
          type="button"
          className="header-action"
          onClick={() => {
            setShowCreate((value) => !value);
            setEditingId(null);
            setError(null);
          }}
        >
          {showCreate ? "Cancelar" : "+ Nova edição"}
        </button>
      </div>

      {showCreate ? (
        <div className="inline-form">
          <div className="form-grid">
            <label className="form-field">
              <span className="field-label">Número da edição</span>
              <input
                type="number"
                min={1}
                value={createForm.editionNumber}
                onChange={(event) => setCreateForm((form) => ({ ...form, editionNumber: event.target.value }))}
                placeholder="Ex.: 769"
              />
            </label>
            <label className="form-field">
              <span className="field-label">Data de publicação</span>
              <input
                type="date"
                value={createForm.publicationDate}
                onChange={(event) => setCreateForm((form) => ({ ...form, publicationDate: event.target.value }))}
              />
            </label>
          </div>
          <div className="form-grid">
            <label className="form-field">
              <span className="field-label">
                Título <span className="field-optional">(opcional)</span>
              </span>
              <input
                value={createForm.title}
                onChange={(event) => setCreateForm((form) => ({ ...form, title: event.target.value }))}
                placeholder="Ex.: Edição 769 — 15 a 21 de setembro"
              />
            </label>
            <label className="form-field">
              <span className="field-label">
                Páginas <span className="field-optional">(opcional)</span>
              </span>
              <input
                type="number"
                min={1}
                value={createForm.pageCount}
                onChange={(event) => setCreateForm((form) => ({ ...form, pageCount: event.target.value }))}
              />
            </label>
          </div>
          <p className="helper-text">
            Depois de criar a edição, envie o PDF uma única vez. O navegador envia diretamente ao Cloudflare R2; a capa é gerada automaticamente da página 1 e o Supabase guarda somente os metadados.
          </p>
          <div className="form-actions">
            <button type="button" className="form-action-primary" onClick={handleCreate} disabled={pending}>
              Salvar edição
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {uploadStage ? (
        <p className="helper-text" role="status" aria-live="polite">
          {uploadStage}
        </p>
      ) : null}

      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>Edição</th>
              <th>Título</th>
              <th>Páginas</th>
              <th>PDF</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((edition) => {
              const isEditing = editingId === edition.id;
              return (
                <tr key={edition.id}>
                  {isEditing ? (
                    <>
                      <td>
                        <div className="form-grid">
                          <input
                            type="number"
                            min={1}
                            value={editForm.editionNumber}
                            onChange={(event) =>
                              setEditForm((form) => ({ ...form, editionNumber: event.target.value }))
                            }
                          />
                          <input
                            type="date"
                            value={editForm.publicationDate}
                            onChange={(event) =>
                              setEditForm((form) => ({ ...form, publicationDate: event.target.value }))
                            }
                          />
                        </div>
                      </td>
                      <td>
                        <input
                          value={editForm.title}
                          onChange={(event) => setEditForm((form) => ({ ...form, title: event.target.value }))}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          value={editForm.pageCount}
                          onChange={(event) => setEditForm((form) => ({ ...form, pageCount: event.target.value }))}
                        />
                      </td>
                      <td>{renderPdfCell(edition)}</td>
                      <td>
                        <span className={`status-pill status-pill--${edition.active ? "published" : "archived"}`}>
                          {edition.active ? "Ativa" : "Inativa"}
                        </span>
                      </td>
                      <td>
                        <div className="candidate-row-actions">
                          <button type="button" onClick={() => handleSaveEdit(edition.id)} disabled={pending}>
                            Salvar
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} disabled={pending}>
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="materia-title">{editionLabel(edition)}</td>
                      <td>{edition.title}</td>
                      <td>{edition.pageCount ?? "—"}</td>
                      <td>{renderPdfCell(edition)}</td>
                      <td>
                        <span className={`status-pill status-pill--${edition.active ? "published" : "archived"}`}>
                          {edition.active ? "Ativa" : "Inativa"}
                        </span>
                      </td>
                      <td>
                        <div className="candidate-row-actions">
                          <button type="button" onClick={() => startEdit(edition)} disabled={pending}>
                            Editar
                          </button>
                          <button type="button" onClick={() => handleToggleActive(edition)} disabled={pending}>
                            {edition.active ? "Inativar" : "Ativar"}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: cartões empilhados, mesma edição inline da tabela. */}
      <ul className="materias-cards">
        {sorted.map((edition) => {
          const isEditing = editingId === edition.id;
          return (
            <li key={edition.id} className="materia-card materia-card--static">
              {isEditing ? (
                <>
                  <label className="form-field">
                    <span className="field-label">Número da edição</span>
                    <input
                      type="number"
                      min={1}
                      value={editForm.editionNumber}
                      onChange={(event) => setEditForm((form) => ({ ...form, editionNumber: event.target.value }))}
                    />
                  </label>
                  <label className="form-field">
                    <span className="field-label">Data de publicação</span>
                    <input
                      type="date"
                      value={editForm.publicationDate}
                      onChange={(event) => setEditForm((form) => ({ ...form, publicationDate: event.target.value }))}
                    />
                  </label>
                  <label className="form-field">
                    <span className="field-label">Título</span>
                    <input
                      value={editForm.title}
                      onChange={(event) => setEditForm((form) => ({ ...form, title: event.target.value }))}
                    />
                  </label>
                  <label className="form-field">
                    <span className="field-label">Páginas</span>
                    <input
                      type="number"
                      min={1}
                      value={editForm.pageCount}
                      onChange={(event) => setEditForm((form) => ({ ...form, pageCount: event.target.value }))}
                    />
                  </label>
                  <div className="form-actions">
                    <button type="button" onClick={() => handleSaveEdit(edition.id)} disabled={pending}>
                      Salvar
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} disabled={pending}>
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="materia-card-head">
                    <span className={`status-pill status-pill--${edition.active ? "published" : "archived"}`}>
                      {edition.active ? "Ativa" : "Inativa"}
                    </span>
                    <span className="materia-reference">{formatDate(edition.publicationDate)}</span>
                  </div>
                  <span className="materia-card-title">{editionLabel(edition)}</span>
                  {edition.title ? <span className="materia-subtitle">{edition.title}</span> : null}
                  <span className="helper-text">{edition.pageCount ? `${edition.pageCount} páginas` : "Páginas não informadas"}</span>
                  {renderPdfCell(edition)}
                  <div className="materia-card-foot">
                    <button type="button" onClick={() => startEdit(edition)} disabled={pending}>
                      Editar
                    </button>
                    <button type="button" onClick={() => handleToggleActive(edition)} disabled={pending}>
                      {edition.active ? "Inativar" : "Ativar"}
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
