"use client";

import { useState, useTransition } from "react";
import { generateCandidates } from "../../app/sistema/editorial/importar-pdf/actions";

interface GenerateCandidatesFormProps {
  editionId: string;
}

/**
 * Seleção de PDF apenas para simular o fluxo: o arquivo nunca é enviado nem
 * lido — só o nome é exibido. A geração dos candidatos é inteiramente mock.
 */
export function GenerateCandidatesForm({ editionId }: GenerateCandidatesFormProps): JSX.Element {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleGenerate(): void {
    setError(null);
    startTransition(async () => {
      const result = await generateCandidates(editionId);
      if ("error" in result) {
        setError(result.error);
      } else {
        setDone(true);
      }
    });
  }

  return (
    <div className="pdf-picker">
      <label className="form-field">
        <span className="field-label">Arquivo PDF</span>
        <input
          type="file"
          accept="application/pdf"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
        />
      </label>
      <p className="helper-text">
        {fileName
          ? `Arquivo selecionado: ${fileName} (apenas para simular o fluxo — nada é enviado).`
          : "Nenhum arquivo é enviado; a seleção só demonstra o fluxo de importação."}
      </p>
      <button type="button" className="header-action" onClick={handleGenerate} disabled={pending}>
        {pending ? "Gerando…" : "Gerar candidatos"}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {done ? <p className="helper-text">Candidatos gerados. Revise a lista abaixo.</p> : null}
    </div>
  );
}
