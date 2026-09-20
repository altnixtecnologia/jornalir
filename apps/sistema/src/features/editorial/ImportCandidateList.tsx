"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EditorialSection, ImportCandidate, Locality } from "@ir/types";
import { discardCandidate, mergeCandidates, convertCandidate } from "../../app/sistema/editorial/importar-pdf/actions";
import { importCandidateStatusLabels } from "./editorialLabels";

interface ImportCandidateListProps {
  candidates: ImportCandidate[];
  sections: EditorialSection[];
  localities: Locality[];
}

export function ImportCandidateList({
  candidates,
  sections,
  localities,
}: ImportCandidateListProps): JSX.Element {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [listError, setListError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const localityById = new Map(localities.map((locality) => [locality.id, locality]));
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  function toggleSelected(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDiscard(id: string): void {
    setListError(null);
    startTransition(async () => {
      const result = await discardCandidate(id);
      if ("error" in result) setListError(result.error);
    });
  }

  function handleConvert(id: string): void {
    setListError(null);
    startTransition(async () => {
      const result = await convertCandidate(id, {});
      if ("error" in result) {
        setListError(result.error);
      } else {
        router.push(`/sistema/editorial/materias/${result.articleId}`);
      }
    });
  }

  function handleMerge(): void {
    const ids = Array.from(selected);
    if (ids.length < 2) {
      setListError("Selecione ao menos dois candidatos pendentes para mesclar.");
      return;
    }
    setListError(null);
    const [primaryId, ...secondaryIds] = ids;
    startTransition(async () => {
      const result = await mergeCandidates(primaryId, secondaryIds);
      if ("error" in result) {
        setListError(result.error);
      } else {
        setSelected(new Set());
      }
    });
  }

  return (
    <>
      <div className="candidates-toolbar">
        <span className="materias-count">
          {candidates.length} candidato(s) · {selected.size} selecionado(s) para mesclar
        </span>
        <button type="button" onClick={handleMerge} disabled={pending || selected.size < 2}>
          Mesclar selecionados
        </button>
      </div>

      {listError ? (
        <p className="form-error" role="alert">
          {listError}
        </p>
      ) : null}

      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th aria-label="Selecionar para mesclar" />
              <th>Página</th>
              <th>Título sugerido</th>
              <th>Editoria sugerida</th>
              <th>Localidade sugerida</th>
              <th>Mídia</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => {
              const section = candidate.suggestedSectionId
                ? sectionById.get(candidate.suggestedSectionId)
                : undefined;
              const locality = candidate.suggestedLocalityId
                ? localityById.get(candidate.suggestedLocalityId)
                : undefined;
              const mediaCount = candidate.suggestedMediaAssetIds?.length ?? 0;
              const mergedInto = candidate.mergedIntoId
                ? candidateById.get(candidate.mergedIntoId)
                : undefined;

              return (
                <tr key={candidate.id}>
                  <td>
                    {candidate.status === "pending" ? (
                      <input
                        type="checkbox"
                        checked={selected.has(candidate.id)}
                        onChange={() => toggleSelected(candidate.id)}
                        aria-label={`Selecionar candidato ${candidate.suggestedTitle ?? candidate.id}`}
                      />
                    ) : null}
                  </td>
                  <td className="materia-reference">
                    {candidate.pageNumber ? `Pág. ${candidate.pageNumber}` : "—"}
                  </td>
                  <td>
                    <span className="materia-title">
                      {candidate.suggestedTitle ?? "Sem título sugerido"}
                    </span>
                    {mergedInto ? (
                      <span className="materia-subtitle">
                        Mesclado em: {mergedInto.suggestedTitle ?? mergedInto.id}
                      </span>
                    ) : null}
                  </td>
                  <td>{section?.name ?? (candidate.status === "pending" ? "Não sugerida" : "—")}</td>
                  <td>{locality?.name ?? (candidate.status === "pending" ? "Não sugerida" : "—")}</td>
                  <td>{mediaCount > 0 ? `${mediaCount} imagem(ns)` : "Sem imagem"}</td>
                  <td>
                    <span className={`status-pill status-pill--${candidate.status === "pending" ? "draft" : candidate.status === "converted" ? "published" : "archived"}`}>
                      {importCandidateStatusLabels[candidate.status]}
                    </span>
                  </td>
                  <td>
                    <div className="candidate-row-actions">
                      <Link className="materia-open-link" href={`/sistema/editorial/importar-pdf/${candidate.id}`}>
                        Abrir ↗
                      </Link>
                      {candidate.status === "pending" ? (
                        <>
                          <button type="button" onClick={() => handleConvert(candidate.id)} disabled={pending}>
                            Converter
                          </button>
                          <button
                            type="button"
                            className="media-remove-button"
                            onClick={() => handleDiscard(candidate.id)}
                            disabled={pending}
                          >
                            Descartar
                          </button>
                        </>
                      ) : null}
                      {candidate.status === "converted" && candidate.createdArticleId ? (
                        <Link className="materia-open-link" href={`/sistema/editorial/materias/${candidate.createdArticleId}`}>
                          Ver rascunho
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
