"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { NewspaperEdition } from "@ir/types";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import {
  abandonEditionR2UploadAction,
  attachArchivedEditionPdfAction,
  createEdition,
  finalizeEditionR2UploadAction,
  prepareEditionR2UploadAction,
  recognizeEditionArchivedPdfAction,
  setEditionActive,
  updateEdition,
  type EditionExtractionOutcome,
  type NewspaperEditionPayload,
} from "../../app/sistema/editorial/edicoes/actions";
import { editionLabel, formatDate } from "./editorialLabels";
import { notify } from "../../lib/feedback/notify";

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
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState<string | null>(null);
  const [checkingArchiveId, setCheckingArchiveId] = useState<string | null>(null);
  const [archiveCandidate, setArchiveCandidate] = useState<Record<string, { key: string; conflict: boolean }>>({});
  const [extractionByEdition, setExtractionByEdition] = useState<Record<string, EditionExtractionOutcome>>({});
  const [pending, startTransition] = useTransition();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const sorted = [...items].sort((a, b) => b.editionNumber - a.editionNumber);

  function startEdit(edition: NewspaperEdition): void {
    setShowCreate(false);
    setEditingId(edition.id);
    setEditForm(toFormValues(edition));
  }

  function handleCreate(): void {
    startTransition(async () => {
      const result = await createEdition(createForm);
      if ("error" in result) {
        notify.error("Não foi possível criar a edição", result.error);
      } else {
        setItems((prev) => [...prev, result.edition]);
        setCreateForm(EMPTY_FORM);
        setShowCreate(false);
        notify.success("Edição criada", "A edição " + editionLabel(result.edition) + " foi criada.");
      }
    });
  }

  function handleSaveEdit(id: string): void {
    startTransition(async () => {
      const result = await updateEdition(id, editForm);
      if ("error" in result) {
        notify.error("Não foi possível salvar a edição", result.error);
      } else {
        setItems((prev) => prev.map((item) => (item.id === id ? result.edition : item)));
        setEditingId(null);
        notify.success("Edição atualizada", "As alterações da edição foram salvas.");
      }
    });
  }

  function handleToggleActive(edition: NewspaperEdition): void {
    startTransition(async () => {
      const result = await setEditionActive(edition.id, !edition.active);
      if ("error" in result) {
        notify.error("Não foi possível alterar a edição", result.error);
      } else {
        setItems((prev) => prev.map((item) => (item.id === edition.id ? result.edition : item)));
        notify.success(edition.active ? "Edição inativada" : "Edição ativada",
          "A edição " + editionLabel(edition) + (edition.active ? " foi inativada." : " foi ativada."));
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

    setUploadingId(editionId);
    setUploadStage("Preparando PDF e capa…");

    startTransition(async () => {
      let plan: {
        pdf: { key: string; uploadUrl: string; publicUrl: string | null };
        cover: { key: string; uploadUrl: string; publicUrl: string | null };
        expiresAt: string;
      } | null = null;
      try {
        const prepared = await analyzePdf(file);
        setUploadStage(`PDF validado · ${prepared.pageCount} páginas · preparando R2…`);

        let authorization = await prepareEditionR2UploadAction(editionId, file.name, file.size, prepared.sha256);
        if ("conflict" in authorization) {
          const confirmed = window.confirm(
            `Esta edição já possui um PDF diferente arquivado${authorization.currentFileName ? ` (${authorization.currentFileName})` : ""}. ` +
              "Substituir pelo arquivo selecionado agora? O PDF e a capa antigos serão removidos do R2 depois da confirmação.",
          );
          if (!confirmed) {
            setUploadStage(null);
            return;
          }
          authorization = await prepareEditionR2UploadAction(editionId, file.name, file.size, prepared.sha256, true);
        }
        if ("error" in authorization) {
          notify.error("Não foi possível enviar a edição", authorization.error);
          return;
        }
        if ("conflict" in authorization) {
          notify.error("Não foi possível enviar a edição", "Confirmação de substituição não foi aceita.");
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
          await abandonEditionR2UploadAction(editionId,plan.pdf.key,plan.cover.key);
          notify.error("Não foi possível enviar a edição", finalized.error);
          return;
        }

        setItems((prev) => prev.map((item) => (item.id === editionId ? finalized.edition : item)));
        if (finalized.extraction) applyExtractionOutcome(editionId, finalized.extraction);
        setUploadStage("PDF e capa publicados no R2.");
        window.setTimeout(() => setUploadStage(null), 2500);
      } catch (uploadError) {
        if (plan) {
          await abandonEditionR2UploadAction(editionId, plan.pdf.key, plan.cover.key);
        }
        notify.error("Não foi possível enviar a edição",
          uploadError instanceof Error ? uploadError.message : "Não foi possível enviar a edição.");
      } finally {
        setUploadingId(null);
      }
    });
  }

  /**
   * Guarda e avisa sobre o resultado da extração automática (disparada pelo
   * servidor imediatamente após arquivar/reaproveitar o PDF — ver
   * `edicoes/actions.ts`). Nunca aparece como erro do arquivamento em si:
   * mesmo "failed" só significa que a extração não rodou agora, o PDF e a
   * capa já estão gravados.
   */
  function applyExtractionOutcome(editionId: string, extraction: EditionExtractionOutcome): void {
    setExtractionByEdition((prev) => ({ ...prev, [editionId]: extraction }));
    if (extraction.status === "ok") {
      notify.success(
        "Matérias extraídas automaticamente",
        `${extraction.candidateCount} candidato(s) de ${extraction.pageCount} página(s) prontos para revisão em Importar PDF.` +
          (extraction.possibleDuplicates.length > 0
            ? ` ${extraction.possibleDuplicates.length} com possível duplicata — confira antes de converter.`
            : ""),
      );
    } else if (extraction.status === "skipped_duplicate") {
      notify.warning(
        "Extração não repetida",
        `Este PDF já tinha sido processado antes (${extraction.previousBatchCandidateCount} candidato(s)). Use "Reprocessar mesmo assim" em Importar PDF se precisar.`,
      );
    } else {
      notify.warning(
        "PDF arquivado, extração automática não concluiu",
        `${extraction.error} O PDF e a capa já estão salvos — tente novamente em Importar PDF quando quiser.`,
      );
    }
  }

  /**
   * Verifica, somente leitura, se o PDF desta edição já existe no acervo
   * histórico do R2 (`acervo/edicoes/IR NNN.pdf`) — nunca faz upload. Só
   * depois de ver o resultado o operador decide reaproveitar
   * (`handleReuseArchivedPdf`).
   */
  function handleCheckArchive(editionId: string): void {
    setCheckingArchiveId(editionId);
    startTransition(async () => {
      try {
        const result = await recognizeEditionArchivedPdfAction(editionId);
        if ("error" in result) {
          notify.error("Não foi possível verificar o acervo R2", result.error);
          return;
        }
        const { decision, candidateKey } = result.result;
        if (!candidateKey) {
          notify.warning("Acervo R2", "Nenhum PDF correspondente a esta edição foi encontrado no acervo histórico.");
          return;
        }
        if (decision === "same_object_already_linked") {
          notify.success("Acervo R2", "Esta edição já está vinculada a este mesmo PDF do acervo.");
          return;
        }
        setArchiveCandidate((prev) => ({
          ...prev,
          [editionId]: { key: candidateKey, conflict: decision === "conflict_requires_decision" },
        }));
        notify.success(
          "PDF encontrado no acervo R2",
          decision === "conflict_requires_decision"
            ? "Já existe um PDF diferente vinculado a esta edição — confirme explicitamente para substituir."
            : "Confirme para reaproveitar sem enviar um novo arquivo.",
        );
      } finally {
        setCheckingArchiveId(null);
      }
    });
  }

  function handleReuseArchivedPdf(editionId: string): void {
    const candidate = archiveCandidate[editionId];
    if (!candidate) return;
    if (candidate.conflict) {
      const confirmed = window.confirm(
        "Esta edição já tem um PDF diferente arquivado. Substituir pelo arquivo do acervo histórico agora?",
      );
      if (!confirmed) return;
    }
    setUploadingId(editionId);
    setUploadStage("Reaproveitando PDF já existente no acervo R2…");
    startTransition(async () => {
      try {
        const result = await attachArchivedEditionPdfAction(editionId, candidate.key, candidate.conflict);
        if ("error" in result) {
          notify.error("Não foi possível vincular o PDF do acervo", result.error);
          return;
        }
        setItems((prev) => prev.map((item) => (item.id === editionId ? result.edition : item)));
        setArchiveCandidate((prev) => {
          const next = { ...prev };
          delete next[editionId];
          return next;
        });
        if (result.extraction) applyExtractionOutcome(editionId, result.extraction);
        setUploadStage("PDF do acervo vinculado — capa gerada automaticamente.");
        window.setTimeout(() => setUploadStage(null), 2500);
      } finally {
        setUploadingId(null);
      }
    });
  }

  function renderPdfCell(edition: NewspaperEdition): JSX.Element {
    const isUploading = uploadingId === edition.id;
    const isCheckingArchive = checkingArchiveId === edition.id;
    const candidate = archiveCandidate[edition.id];
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
        <button
          type="button"
          onClick={() => handleCheckArchive(edition.id)}
          disabled={pending || isUploading || isCheckingArchive}
          title="Verifica, sem enviar nada, se este PDF já existe no acervo histórico do R2."
        >
          {isCheckingArchive ? "Verificando…" : "Verificar acervo R2"}
        </button>
        {candidate ? (
          <button type="button" onClick={() => handleReuseArchivedPdf(edition.id)} disabled={pending || isUploading}>
            {candidate.conflict ? "Substituir pelo PDF do acervo" : "Reaproveitar PDF do acervo"}
          </button>
        ) : null}
        <input
          ref={(element) => {
            fileInputRefs.current[edition.id] = element;
          }}
          type="file"
          accept="application/pdf"
          className="visually-hidden"
          onChange={(event) => handlePdfSelected(edition.id, event)}
        />
        {renderExtractionSummary(edition.id)}
      </div>
    );
  }

  /**
   * Resumo da extração automática, exibido ANTES da revisão editorial
   * (Importar PDF) — exatamente onde o operador acabou de arquivar/
   * reaproveitar o PDF. Nunca permite descartar/substituir nada aqui; só
   * informa e linka para a tela de revisão de candidatos.
   */
  function renderExtractionSummary(editionId: string): JSX.Element | null {
    const extraction = extractionByEdition[editionId];
    if (!extraction) return null;
    if (extraction.status === "failed") {
      return (
        <p className="helper-text" style={{ color: "var(--danger, #b42318)" }}>
          PDF arquivado; extração automática não concluiu ({extraction.error}).{" "}
          <Link href={`/sistema/editorial/importar-pdf?edicao=${editionId}`}>Tentar novamente</Link>
        </p>
      );
    }
    if (extraction.status === "skipped_duplicate") {
      return (
        <p className="helper-text">
          Este PDF já tinha sido processado ({extraction.previousBatchCandidateCount} candidato(s)).{" "}
          <Link href={`/sistema/editorial/importar-pdf?edicao=${editionId}`}>Revisar em Importar PDF</Link>
        </p>
      );
    }
    return (
      <div className="helper-text">
        <p>
          {extraction.candidateCount} candidato(s) extraído(s) automaticamente de {extraction.pageCount} página(s) —{" "}
          <Link href={`/sistema/editorial/importar-pdf?edicao=${editionId}`}>revisar agora</Link>.
        </p>
        {extraction.possibleDuplicates.length > 0 ? (
          <div className="form-error" role="alert">
            <p>Possível duplicata com matéria já existente:</p>
            <ul>
              {extraction.possibleDuplicates.map((warning) => (
                <li key={warning.candidateId}>
                  <strong>{warning.title ?? "Sem título sugerido"}</strong>
                  {" — "}
                  {warning.matches.map((match, index) => (
                    <span key={match.articleId}>
                      {index > 0 ? "; " : ""}
                      <Link href={`/sistema/editorial/materias/${match.articleId}`}>{match.title}</Link>
                      {` (${Math.round(match.score * 100)}%)`}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
