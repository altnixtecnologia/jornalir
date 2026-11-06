"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { NewspaperEdition } from "@ir/types";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import {
  abandonEditionR2UploadAction,
  attachArchivedEditionPdfAction,
  createEdition,
  finalizeEditionR2UploadAction,
  getEditionAuditTrailAction,
  prepareEditionR2UploadAction,
  recognizeEditionArchivedPdfAction,
  reprocessEditionMateriasAction,
  scheduleEditionAvailabilityAction,
  setEditionActive,
  updateEdition,
  type EditionAuditEntry,
  type EditionExtractionOutcome,
  type NewspaperEditionPayload,
} from "../../app/sistema/editorial/edicoes/actions";
import { editionLabel, formatDate } from "./editorialLabels";
import { notify } from "../../lib/feedback/notify";
import { saoPauloLocalInputToUtcIso, utcIsoToSaoPauloLocalInput } from "../../lib/editorial/editionAvailabilityScheduling";

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

type SortColumn = "editionNumber" | "title" | "publicationDate" | "pageCount" | "pdf" | "status";
type SortDirection = "asc" | "desc";

// Correção da auditoria (item 6, 06/11/2026): a coluna "status" (Ativa/
// Inativa) saiu da listagem — redundante com "Jornal Online" e deixava a
// tabela mais larga que o modelo aprovado. A ação de ativar/inativar
// manualmente passou para o modal de Detalhes (EditionDetailsModal).
const SORTABLE_COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "editionNumber", label: "Edição" },
  { key: "title", label: "Título" },
  { key: "publicationDate", label: "Data" },
  { key: "pageCount", label: "Páginas" },
  { key: "pdf", label: "PDF" },
];

function toFormValues(edition: NewspaperEdition): NewspaperEditionPayload {
  return {
    editionNumber: String(edition.editionNumber),
    title: edition.title,
    publicationDate: edition.publicationDate,
    pageCount: edition.pageCount?.toString() ?? "",
  };
}

/** Valor comparável de cada coluna ordenável — números comparam numericamente,
 * `publicationDate` (ISO AAAA-MM-DD) compara cronologicamente por ser já uma
 * string ordenável lexicograficamente nesse formato. */
function sortValue(edition: NewspaperEdition, column: SortColumn): string | number {
  switch (column) {
    case "editionNumber":
      return edition.editionNumber;
    case "title":
      return (edition.title ?? "").toLocaleLowerCase("pt-BR");
    case "publicationDate":
      return edition.publicationDate;
    case "pageCount":
      return edition.pageCount ?? -1;
    case "pdf":
      return edition.pdfUrl ? 1 : 0;
    case "status":
      return edition.active ? 1 : 0;
  }
}

/**
 * Gestão de edições do jornal (Fase 28) — cadastro/edição real, sempre a
 * partir de `NewspaperEditionService`. Nunca exclusão destrutiva: inativar
 * é a única remoção pela UI (uma edição já referenciada por matérias/
 * candidatos de importação nunca pode sumir de baixo delas).
 *
 * Melhoria de UI (05/11/2026): Nova edição/Editar edição passaram a ser um
 * modal único (em vez de formulário inline/edição em linha da tabela);
 * pesquisa única acima da tabela (edição, título ou data); cabeçalhos
 * ordenáveis; coluna Data visível. Nenhuma ação do R2/extração/duplicata foi
 * alterada — só a apresentação de cadastro/edição/listagem.
 */
export function EdicoesManager({ editions }: EdicoesManagerProps): JSX.Element {
  const [items, setItems] = useState(editions);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [modalEditingId, setModalEditingId] = useState<string | null>(null);
  const [modalForm, setModalForm] = useState<NewspaperEditionPayload>(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState<string | null>(null);
  const [checkingArchiveId, setCheckingArchiveId] = useState<string | null>(null);
  const [archiveCandidate, setArchiveCandidate] = useState<Record<string, { key: string; conflict: boolean }>>({});
  const [extractionByEdition, setExtractionByEdition] = useState<Record<string, EditionExtractionOutcome>>({});
  const [pending, startTransition] = useTransition();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [scheduleValue, setScheduleValue] = useState("");
  const [detailsEditionId, setDetailsEditionId] = useState<string | null>(null);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? items.filter((edition) => {
          const haystack = `${edition.editionNumber} ${edition.title ?? ""} ${formatDate(edition.publicationDate)}`
            .toLowerCase();
          return haystack.includes(term);
        })
      : items;

    if (!sortColumn) {
      // Sem coluna escolhida: ordem inicial, mais recentes primeiro.
      return [...filtered].sort((a, b) => b.editionNumber - a.editionNumber);
    }
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const valueA = sortValue(a, sortColumn);
      const valueB = sortValue(b, sortColumn);
      if (typeof valueA === "number" && typeof valueB === "number") {
        return (valueA - valueB) * direction;
      }
      return String(valueA).localeCompare(String(valueB), "pt-BR") * direction;
    });
  }, [items, search, sortColumn, sortDirection]);

  function handleSort(column: SortColumn): void {
    if (sortColumn === column) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  function sortIndicator(column: SortColumn): string {
    if (sortColumn !== column) return "";
    return sortDirection === "asc" ? " ▲" : " ▼";
  }

  function ariaSortFor(column: SortColumn): "ascending" | "descending" | "none" {
    if (sortColumn !== column) return "none";
    return sortDirection === "asc" ? "ascending" : "descending";
  }

  function openCreateModal(): void {
    setModalMode("create");
    setModalEditingId(null);
    setModalForm(EMPTY_FORM);
  }

  function openEditModal(edition: NewspaperEdition): void {
    setModalMode("edit");
    setModalEditingId(edition.id);
    setModalForm(toFormValues(edition));
  }

  function closeModal(): void {
    setModalMode(null);
    setModalEditingId(null);
  }

  function handleModalSave(): void {
    startTransition(async () => {
      const result = modalEditingId
        ? await updateEdition(modalEditingId, modalForm)
        : await createEdition(modalForm);
      if ("error" in result) {
        notify.error(modalEditingId ? "Não foi possível salvar a edição" : "Não foi possível criar a edição", result.error);
        return;
      }
      if (modalEditingId) {
        setItems((prev) => prev.map((item) => (item.id === modalEditingId ? result.edition : item)));
        notify.success("Edição atualizada", "As alterações da edição foram salvas.");
      } else {
        setItems((prev) => [...prev, result.edition]);
        notify.success("Edição criada", "A edição " + editionLabel(result.edition) + " foi criada.");
      }
      closeModal();
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
   * Guarda e avisa que a separação de matérias foi enfileirada (correção
   * da auditoria, item 3, 06/11/2026) — o PDF e a capa já estão gravados
   * nesta mesma resposta; a extração/conversão em si roda depois, fora
   * desta requisição, pelo worker durável (`/api/cron/edition-materias`,
   * a cada minuto). O progresso real aparece na coluna "Matérias" e no
   * modal de Detalhes assim que a tela for atualizada.
   */
  function applyExtractionOutcome(editionId: string, extraction: EditionExtractionOutcome): void {
    setExtractionByEdition((prev) => ({ ...prev, [editionId]: extraction }));
    notify.success(
      "Separação de matérias enfileirada",
      "Os rascunhos aparecerão automaticamente na área Editorial em alguns minutos, sem necessidade de revisão manual.",
    );
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

  const ONLINE_STATUS_LABEL: Record<string, string> = {
    preparing: "Preparando",
    scheduled: "Agendado",
    available: "Disponível",
    attention: "Atenção",
  };
  const MATERIAS_STATUS_LABEL: Record<string, string> = {
    queued: "Na fila",
    processing: "Processando",
    completed: "Concluído",
    partial: "Parcial",
    failed: "Falhou",
  };

  function onlineStatusPillClass(status?: string): string {
    switch (status) {
      case "available":
        return "status-pill--published";
      case "attention":
        return "status-pill--archived";
      default:
        return "status-pill--draft";
    }
  }

  function materiasStatusPillClass(status?: string | null): string {
    switch (status) {
      case "completed":
        return "status-pill--published";
      case "failed":
        return "status-pill--archived";
      case "partial":
        return "status-pill--draft";
      default:
        return "status-pill--draft";
    }
  }

  function renderOnlineStatusCell(edition: NewspaperEdition): JSX.Element {
    const status = edition.onlineStatus ?? "preparing";
    return (
      <div className="edicoes-status-cell">
        <span className={`status-pill ${onlineStatusPillClass(status)}`}>{ONLINE_STATUS_LABEL[status] ?? status}</span>
      </div>
    );
  }

  function renderMateriasStatusCell(edition: NewspaperEdition): JSX.Element {
    const status = edition.materiasStatus;
    if (!status) {
      return <span className="helper-text">—</span>;
    }
    const label = MATERIAS_STATUS_LABEL[status] ?? status;
    const suffix = status === "completed" && edition.materiasDraftCount !== undefined
      ? ` (${edition.materiasDraftCount})`
      : "";
    return (
      <div className="edicoes-status-cell">
        <span className={`status-pill ${materiasStatusPillClass(status)}`}>{label}{suffix}</span>
      </div>
    );
  }

  function renderDisponibilizacaoCell(edition: NewspaperEdition): JSX.Element {
    if (editingScheduleId === edition.id) {
      return (
        <div className="edicoes-schedule-editor">
          <input
            type="datetime-local"
            value={scheduleValue}
            onChange={(event) => setScheduleValue(event.target.value)}
          />
          <div className="candidate-row-actions">
            <button type="button" disabled={pending} onClick={() => handleSaveSchedule(edition.id)}>
              Salvar
            </button>
            <button type="button" disabled={pending} onClick={() => setEditingScheduleId(null)}>
              Cancelar
            </button>
          </div>
        </div>
      );
    }
    if (edition.onlineStatus === "available" && edition.availableAt) {
      return <span>{new Date(edition.availableAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>;
    }
    if (edition.scheduledAvailableAt) {
      return (
        <div className="edicoes-status-cell">
          <span>{new Date(edition.scheduledAvailableAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setEditingScheduleId(edition.id);
              setScheduleValue(utcIsoToSaoPauloLocalInput(edition.scheduledAvailableAt as string));
            }}
          >
            Alterar
          </button>
        </div>
      );
    }
    return <span className="helper-text">Envie o PDF para agendar</span>;
  }

  function handleSaveSchedule(editionId: string): void {
    if (!saoPauloLocalInputToUtcIso(scheduleValue)) {
      notify.error("Data/hora inválida", "Informe uma data e hora válidas.");
      return;
    }
    startTransition(async () => {
      const result = await scheduleEditionAvailabilityAction(editionId, scheduleValue);
      if ("error" in result) {
        notify.error("Não foi possível agendar a disponibilização", result.error);
        return;
      }
      setItems((prev) => prev.map((item) => (item.id === editionId ? result.edition : item)));
      setEditingScheduleId(null);
      notify.success("Disponibilização agendada", "A data e hora foram atualizadas.");
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
   * Aviso único logo após arquivar/reaproveitar o PDF — a separação de
   * matérias foi enfileirada (correção da auditoria, item 3, 06/11/2026);
   * o progresso real (extraído, convertido, falhas) aparece na coluna
   * "Matérias" e no modal de Detalhes assim que o worker durável
   * processar, não é mais um resultado síncrono desta chamada.
   */
  function renderExtractionSummary(editionId: string): JSX.Element | null {
    const extraction = extractionByEdition[editionId];
    if (!extraction) return null;
    return (
      <p className="helper-text">
        Separação de matérias enfileirada — acompanhe o progresso na coluna "Matérias" ou em Detalhes.
      </p>
    );
  }

  return (
    <>
      <div className="materias-toolbar">
        <div className="materias-filters">
          <label className="materias-search">
            Pesquisar
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Número, título ou data (DD/MM/AAAA)"
            />
          </label>
        </div>
        <span className="materias-count">{visibleItems.length} de {items.length} edição(ões)</span>
        <button type="button" className="header-action" onClick={openCreateModal}>
          + Nova edição
        </button>
      </div>

      {uploadStage ? (
        <p className="helper-text" role="status" aria-live="polite">
          {uploadStage}
        </p>
      ) : null}

      <div className="materias-table-wrap edicoes-table-wrap">
        <table className="materias-table edicoes-table">
          <thead>
            <tr>
              {SORTABLE_COLUMNS.map((column) => (
                <th key={column.key} aria-sort={ariaSortFor(column.key)}>
                  <button
                    type="button"
                    className={`materia-sort-button${sortColumn === column.key ? " is-active" : ""}`}
                    onClick={() => handleSort(column.key)}
                  >
                    {column.label}
                    {sortIndicator(column.key)}
                  </button>
                </th>
              ))}
              <th>Disponibilização</th>
              <th>Jornal Online</th>
              <th>Matérias</th>
              <th>Ações</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((edition) => (
              <tr key={edition.id}>
                <td className="materia-title">{editionLabel(edition)}</td>
                <td>{edition.title}</td>
                <td>{formatDate(edition.publicationDate)}</td>
                <td>{edition.pageCount ?? "—"}</td>
                <td>{renderPdfCell(edition)}</td>
                <td>{renderDisponibilizacaoCell(edition)}</td>
                <td>{renderOnlineStatusCell(edition)}</td>
                <td>{renderMateriasStatusCell(edition)}</td>
                <td>
                  <div className="candidate-row-actions">
                    <button type="button" onClick={() => openEditModal(edition)} disabled={pending}>
                      Editar
                    </button>
                  </div>
                </td>
                <td>
                  <button type="button" onClick={() => setDetailsEditionId(edition.id)}>
                    Detalhes
                  </button>
                </td>
              </tr>
            ))}
            {visibleItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="helper-text">
                  Nenhuma edição encontrada para esta pesquisa.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Mobile: cartões empilhados, mesma edição da tabela. */}
      <ul className="materias-cards">
        {visibleItems.map((edition) => (
          <li key={edition.id} className="materia-card materia-card--static">
            <div className="materia-card-head">
              <span className="materia-reference">{formatDate(edition.publicationDate)}</span>
            </div>
            <span className="materia-card-title">{editionLabel(edition)}</span>
            {edition.title ? <span className="materia-subtitle">{edition.title}</span> : null}
            <span className="helper-text">{edition.pageCount ? `${edition.pageCount} páginas` : "Páginas não informadas"}</span>
            {renderPdfCell(edition)}
            <div className="edicoes-mobile-statuses">
              <div>
                <span className="field-label">Disponibilização</span>
                {renderDisponibilizacaoCell(edition)}
              </div>
              <div>
                <span className="field-label">Jornal Online</span>
                {renderOnlineStatusCell(edition)}
              </div>
              <div>
                <span className="field-label">Matérias</span>
                {renderMateriasStatusCell(edition)}
              </div>
            </div>
            <div className="materia-card-foot">
              <button type="button" onClick={() => openEditModal(edition)} disabled={pending}>
                Editar
              </button>
              <button type="button" onClick={() => setDetailsEditionId(edition.id)}>
                Detalhes
              </button>
            </div>
          </li>
        ))}
        {visibleItems.length === 0 ? <li className="helper-text">Nenhuma edição encontrada para esta pesquisa.</li> : null}
      </ul>

      {modalMode ? (
        <EditionFormModal
          mode={modalMode}
          form={modalForm}
          pending={pending}
          onChange={setModalForm}
          onSave={handleModalSave}
          onClose={closeModal}
        />
      ) : null}

      {detailsEditionId ? (
        <EditionDetailsModal
          edition={items.find((item) => item.id === detailsEditionId) ?? null}
          onClose={() => setDetailsEditionId(null)}
          onToggleActive={handleToggleActive}
          pending={pending}
        />
      ) : null}
    </>
  );
}

interface EditionFormModalProps {
  mode: "create" | "edit";
  form: NewspaperEditionPayload;
  pending: boolean;
  onChange: (updater: (form: NewspaperEditionPayload) => NewspaperEditionPayload) => void;
  onSave: () => void;
  onClose: () => void;
}

/**
 * Modal único para Nova edição/Editar edição (melhoria de UI, 05/11/2026) —
 * mesma estrutura de backdrop fixo + caixa centralizada já usada em
 * `ArticleImageEditorModal.tsx`: ESC fecha, scroll do fundo bloqueado
 * enquanto aberto, mesmos campos/validações do formulário anterior (nenhuma
 * regra nova). O envio de PDF, verificação/reaproveitamento do acervo R2 e
 * ativação/inativação continuam fora do modal, na própria linha da tabela.
 */
function EditionFormModal({ mode, form, pending, onChange, onSave, onClose }: EditionFormModalProps): JSX.Element {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return (
    <div
      className="edicoes-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <section className="edicoes-modal" role="dialog" aria-modal="true" aria-labelledby="edicao-modal-title">
        <header className="edicoes-modal-header">
          <h3 id="edicao-modal-title">{mode === "edit" ? "Editar edição" : "Nova edição"}</h3>
          <button type="button" className="edicoes-modal-close" onClick={onClose} disabled={pending} aria-label="Fechar">
            ✕
          </button>
        </header>

        <div className="edicoes-modal-body">
          <div className="form-grid">
            <label className="form-field">
              <span className="field-label">Número da edição</span>
              <input
                type="number"
                min={1}
                value={form.editionNumber}
                onChange={(event) => onChange((current) => ({ ...current, editionNumber: event.target.value }))}
                placeholder="Ex.: 769"
              />
            </label>
            <label className="form-field">
              <span className="field-label">Data de publicação</span>
              <input
                type="date"
                value={form.publicationDate}
                onChange={(event) => onChange((current) => ({ ...current, publicationDate: event.target.value }))}
              />
            </label>
          </div>
          <label className="form-field">
            <span className="field-label">
              Título <span className="field-optional">(opcional)</span>
            </span>
            <input
              value={form.title}
              onChange={(event) => onChange((current) => ({ ...current, title: event.target.value }))}
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
              value={form.pageCount}
              onChange={(event) => onChange((current) => ({ ...current, pageCount: event.target.value }))}
            />
          </label>
          {mode === "create" ? (
            <p className="helper-text">
              Depois de criar a edição, envie o PDF uma única vez (ou reaproveite um já existente no acervo R2). O
              navegador envia diretamente ao Cloudflare R2; a capa é gerada automaticamente e o Supabase guarda
              somente os metadados.
            </p>
          ) : null}
        </div>

        <footer className="edicoes-modal-footer">
          <button type="button" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="button" className="form-action-primary" onClick={onSave} disabled={pending}>
            Salvar edição
          </button>
        </footer>
      </section>
    </div>
  );
}

const AUDIT_ACTION_LABEL: Record<string, string> = {
  edition_published_auto: "Publicação automática (Jornal Online)",
  edition_notification_dispatched: "Notificação enviada",
  edition_notification_skipped: "Notificação ignorada (desativada)",
  edition_notification_failed: "Falha ao enviar notificação",
  edition_schedule_set: "Data/hora de disponibilização alterada",
  edition_materias_candidate_failed: "Falha ao converter um candidato em rascunho",
  edition_materias_reprocess_requested: "Reprocessamento da separação de matérias solicitado",
};

interface EditionDetailsModalProps {
  edition: NewspaperEdition | null;
  onClose: () => void;
  onToggleActive: (edition: NewspaperEdition) => void;
  pending: boolean;
}

/**
 * Modal de detalhes (fluxo unificado, 06/11/2026) — histórico completo
 * (audit_events reaproveitado) e reprocessamento seletivo da separação de
 * matérias quando o processo falhou/ficou parcial. Nunca reprocessa o
 * Jornal Online (já concluído) nem duplica candidatos/rascunhos já criados
 * (mesma proteção de hash/idempotência do importador).
 *
 * Correção da auditoria (item 6, 06/11/2026): ativar/inativar manualmente
 * a edição (ação pré-existente, independente do Jornal Online automático)
 * saiu da tabela/cartões e virou uma ação deste modal — a listagem não
 * ganhou uma coluna nova, e a ação continua disponível.
 */
function EditionDetailsModal({ edition, onClose, onToggleActive, pending }: EditionDetailsModalProps): JSX.Element | null {
  const [entries, setEntries] = useState<EditionAuditEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState(false);

  useEffect(() => {
    if (!edition) return;
    let active = true;
    getEditionAuditTrailAction(edition.id).then((result) => {
      if (!active) return;
      if ("error" in result) {
        setLoadError(result.error);
      } else {
        setEntries(result.entries);
      }
    });
    return () => {
      active = false;
    };
  }, [edition]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (!edition) return null;

  function handleReprocessMaterias(): void {
    setReprocessing(true);
    reprocessEditionMateriasAction(edition!.id)
      .then((result) => {
        if ("error" in result) {
          notify.error("Não foi possível reprocessar a separação de matérias", result.error);
          return;
        }
        notify.success("Reprocessamento concluído", "A separação de matérias foi executada novamente para esta edição.");
      })
      .finally(() => setReprocessing(false));
  }

  const canReprocessMaterias = edition.materiasStatus === "failed" || edition.materiasStatus === "partial";

  return (
    <div className="edicoes-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="edicoes-modal edicoes-details-modal" role="dialog" aria-modal="true" aria-labelledby="edicao-details-title">
        <header className="edicoes-modal-header">
          <h3 id="edicao-details-title">Detalhes — {editionLabel(edition)}</h3>
          <button type="button" className="edicoes-modal-close" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </header>

        <div className="edicoes-modal-body">
          <section className="edicoes-details-section">
            <h4>Edição</h4>
            <dl className="edicoes-details-grid">
              <dt>Status manual</dt>
              <dd>
                <span className={`status-pill status-pill--${edition.active ? "published" : "archived"}`}>
                  {edition.active ? "Ativa" : "Inativa"}
                </span>
                {" "}
                <button type="button" onClick={() => onToggleActive(edition)} disabled={pending}>
                  {edition.active ? "Inativar" : "Ativar"}
                </button>
              </dd>
            </dl>
          </section>

          <section className="edicoes-details-section">
            <h4>Jornal Online</h4>
            <dl className="edicoes-details-grid">
              <dt>Estado</dt>
              <dd>{edition.onlineStatus ?? "preparing"}{edition.onlineError ? ` — ${edition.onlineError}` : ""}</dd>
              <dt>Arquivo</dt>
              <dd>{edition.pdfFileName ?? "—"}</dd>
              <dt>Enviado por</dt>
              <dd>{edition.uploadedByName ?? "—"}{edition.uploadedAt ? ` em ${new Date(edition.uploadedAt).toLocaleString("pt-BR")}` : ""}</dd>
              <dt>Agendado para</dt>
              <dd>
                {edition.scheduledAvailableAt
                  ? new Date(edition.scheduledAvailableAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
                  : "—"}
                {edition.scheduledByName ? ` (agendado por ${edition.scheduledByName})` : ""}
              </dd>
              <dt>Disponível desde</dt>
              <dd>{edition.availableAt ? new Date(edition.availableAt).toLocaleString("pt-BR") : "Ainda não disponível"}</dd>
              <dt>Notificação</dt>
              <dd>
                {edition.notificationStatus ?? "pending"}
                {edition.notificationSentAt ? ` em ${new Date(edition.notificationSentAt).toLocaleString("pt-BR")}` : ""}
              </dd>
            </dl>
          </section>

          <section className="edicoes-details-section">
            <h4>Separação de matérias</h4>
            <dl className="edicoes-details-grid">
              <dt>Estado</dt>
              <dd>{edition.materiasStatus ?? "nunca executado"}</dd>
              <dt>Início/Conclusão</dt>
              <dd>
                {edition.materiasStartedAt ? new Date(edition.materiasStartedAt).toLocaleString("pt-BR") : "—"}
                {" → "}
                {edition.materiasFinishedAt ? new Date(edition.materiasFinishedAt).toLocaleString("pt-BR") : "em andamento/—"}
              </dd>
              <dt>Candidatos / rascunhos / falhas</dt>
              <dd>
                {edition.materiasCandidateCount ?? 0} / {edition.materiasDraftCount ?? 0} / {edition.materiasFailedCount ?? 0}
              </dd>
            </dl>
            {canReprocessMaterias ? (
              <button type="button" onClick={handleReprocessMaterias} disabled={reprocessing}>
                {reprocessing ? "Reprocessando…" : "Reprocessar separação de matérias"}
              </button>
            ) : null}
          </section>

          <section className="edicoes-details-section">
            <h4>Histórico</h4>
            {loadError ? <p className="form-error">{loadError}</p> : null}
            {entries === null && !loadError ? <p className="helper-text">Carregando histórico…</p> : null}
            {entries && entries.length === 0 ? <p className="helper-text">Nenhum evento registrado ainda.</p> : null}
            {entries && entries.length > 0 ? (
              <ul className="edicoes-audit-list">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <span className="edicoes-audit-action">{AUDIT_ACTION_LABEL[entry.action] ?? entry.action}</span>
                    <span className="helper-text">
                      {new Date(entry.createdAt).toLocaleString("pt-BR")} —{" "}
                      {entry.actorName ? entry.actorName : "Sistema"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>

        <footer className="edicoes-modal-footer">
          <button type="button" onClick={onClose}>
            Fechar
          </button>
        </footer>
      </section>
    </div>
  );
}
