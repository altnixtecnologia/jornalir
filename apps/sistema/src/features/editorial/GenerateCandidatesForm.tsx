"use client";

import { useRef, useState, useTransition } from "react";
import {
  generateCandidates,
  generateCandidatesFromArchivedPdf,
} from "../../app/sistema/editorial/importar-pdf/actions";
import { notify } from "../../lib/feedback/notify";

interface GenerateCandidatesFormProps {
  editionId: string;
  archivedPdfAvailable?: boolean;
  archivedFileName?: string;
}

interface DoneState {
  candidateCount: number;
  pageCount: number;
  pagesWithoutText: number[];
  warnings: string[];
}

interface DuplicateState {
  fileName?: string;
  createdAt: string;
  candidateCount: number;
}

/**
 * Reutiliza o PDF oficial do R2 quando disponível; o seletor manual fica
 * como fallback para legado ou reprocessamento excepcional.
 *
 * Antes de processar, o servidor verifica se este MESMO arquivo (por hash)
 * já foi processado pra esta edição — se sim, nenhum lote novo é gerado
 * sem confirmação explícita ("Reprocessar mesmo assim").
 */
export function GenerateCandidatesForm({
  editionId,
  archivedPdfAvailable = false,
  archivedFileName,
}: GenerateCandidatesFormProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [done, setDone] = useState<DoneState | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateState | null>(null);
  const [pending, startTransition] = useTransition();

  function handleGenerate(force = false): void {
    const file = fileInputRef.current?.files?.[0];
    if (!file && !archivedPdfAvailable) {
      notify.error("Nenhum PDF selecionado", "Selecione um arquivo PDF.");
      return;
    }

    setDone(null);
    if (!force) setDuplicate(null);

    startTransition(async () => {
      const result = file
        ? await (() => {
            const formData = new FormData();
            formData.set("pdf", file);
            if (force) formData.set("force", "1");
            return generateCandidates(editionId, formData);
          })()
        : await generateCandidatesFromArchivedPdf(editionId, force);

      if ("error" in result) {
        notify.error("Não foi possível extrair os candidatos", result.error);
      } else if ("duplicate" in result) {
        setDuplicate(result.previousBatch);
      } else {
        setDuplicate(null);
        setDone(result);
      }
    });
  }

  return (
    <div className="pdf-picker">
      {archivedPdfAvailable ? (
        <div
          className="rounded-lg border p-3"
          style={{ borderColor: "var(--line)", background: "var(--surface, #fff)" }}
        >
          <strong>PDF oficial já arquivado no R2</strong>
          <p className="helper-text" style={{ marginBottom: 0 }}>
            {archivedFileName || "PDF da edição"} será reutilizado diretamente, sem novo upload.
          </p>
        </div>
      ) : null}

      <details className="generate-more" open={!archivedPdfAvailable}>
        <summary>{archivedPdfAvailable ? "Usar outro PDF nesta extração" : "Selecionar PDF"}</summary>
        <label className="form-field" style={{ marginTop: 10 }}>
          <span className="field-label">Arquivo PDF</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
          />
        </label>
        <p className="helper-text">
          {fileName
            ? `Arquivo selecionado: ${fileName}.`
            : archivedPdfAvailable
              ? "Se nenhum arquivo for escolhido, a extração usará o PDF oficial arquivado."
              : "Selecione o PDF da edição impressa."}
        </p>
      </details>

      <button type="button" className="header-action" onClick={() => handleGenerate(false)} disabled={pending}>
        {pending ? "Extraindo…" : archivedPdfAvailable && !fileName ? "Gerar candidatos do PDF arquivado" : "Gerar candidatos"}
      </button>
      {duplicate ? (
        <div className="form-error" role="alert">
          <p>
            Este PDF já foi processado para esta edição em{" "}
            {new Date(duplicate.createdAt).toLocaleString("pt-BR")}
            {duplicate.fileName ? ` (${duplicate.fileName})` : ""}, gerando {duplicate.candidateCount}{" "}
            candidato(s).
          </p>
          <button type="button" onClick={() => handleGenerate(true)} disabled={pending}>
            {pending ? "Reprocessando…" : "Reprocessar mesmo assim"}
          </button>
        </div>
      ) : null}
      {done ? (
        <div className="helper-text">
          <p>
            {done.candidateCount} candidato(s) extraído(s) de {done.pageCount} página(s). Revise a lista abaixo.
          </p>
          {done.pagesWithoutText.length > 0 ? (
            <p>
              Página(s) sem camada de texto (OCR indisponível nesta instalação): {done.pagesWithoutText.join(", ")}.
            </p>
          ) : null}
          {done.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
