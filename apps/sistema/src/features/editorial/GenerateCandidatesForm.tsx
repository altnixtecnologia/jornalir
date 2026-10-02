"use client";

import { useRef, useState, useTransition } from "react";
import { generateCandidates } from "../../app/sistema/editorial/importar-pdf/actions";

interface GenerateCandidatesFormProps {
  editionId: string;
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
 * Lê o PDF selecionado e extrai candidatos reais. Quando a edição ainda
 * não possui PDF oficial, o mesmo arquivo também é arquivado no Google
 * Drive do Jornal Online; o Supabase guarda apenas a URL.
 *
 * Antes de processar, o servidor verifica se este MESMO arquivo (por hash)
 * já foi processado pra esta edição — se sim, nenhum lote novo é gerado
 * sem confirmação explícita ("Reprocessar mesmo assim").
 */
export function GenerateCandidatesForm({ editionId }: GenerateCandidatesFormProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<DoneState | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateState | null>(null);
  const [pending, startTransition] = useTransition();

  function handleGenerate(force = false): void {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Selecione um arquivo PDF.");
      return;
    }
    setError(null);
    setDone(null);
    if (!force) setDuplicate(null);
    const formData = new FormData();
    formData.set("pdf", file);
    if (force) formData.set("force", "1");
    startTransition(async () => {
      const result = await generateCandidates(editionId, formData);
      if ("error" in result) {
        setError(result.error);
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
      <label className="form-field">
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
          ? `Arquivo selecionado: ${fileName}. Ao gerar, ele também será usado como PDF oficial do Jornal Online se a edição ainda não tiver um.`
          : "Selecione o PDF da edição impressa. O mesmo arquivo pode alimentar a importação e o Jornal Online."}
      </p>
      <button type="button" className="header-action" onClick={() => handleGenerate(false)} disabled={pending}>
        {pending ? "Extraindo…" : "Gerar candidatos"}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
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
