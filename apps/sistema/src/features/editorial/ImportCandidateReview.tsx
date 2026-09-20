"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ArticleMedia, EditorialSection, ImportCandidate, Locality, MediaAsset } from "@ir/types";
import {
  convertCandidate,
  discardCandidate,
  keepCandidate,
  splitCandidate,
} from "../../app/sistema/editorial/importar-pdf/actions";
import { ArticleBodyEditor } from "./ArticleBodyEditor";
import { ArticleMediaPicker } from "./ArticleMediaPicker";
import { ImportCandidateSourcePreview } from "./ImportCandidateSourcePreview";
import {
  addGalleryMedia,
  moveGalleryMedia,
  removeCoverMedia,
  removeGalleryMedia,
  setCoverMedia,
  suggestedIdsToArticleMedia,
} from "./articleMediaState";
import { importCandidateStatusLabels } from "./editorialLabels";

const EXTRACTION_METHOD_LABELS: Record<string, string> = {
  textLayer: "Camada de texto do PDF",
  ocr: "OCR (reconhecimento óptico)",
  manual: "Entrada manual",
};

interface ImportCandidateReviewProps {
  candidate: ImportCandidate;
  editionTitle: string;
  sections: EditorialSection[];
  localities: Locality[];
  mediaAssets: MediaAsset[];
}

export function ImportCandidateReview({
  candidate,
  editionTitle,
  sections,
  localities,
  mediaAssets,
}: ImportCandidateReviewProps): JSX.Element {
  const router = useRouter();
  const [title, setTitle] = useState(candidate.suggestedTitle ?? "");
  const [subtitle, setSubtitle] = useState(candidate.suggestedSubtitle ?? "");
  const [body, setBody] = useState(candidate.suggestedBody ?? "");
  const [sectionId, setSectionId] = useState(candidate.suggestedSectionId ?? "");
  const [localityId, setLocalityId] = useState(candidate.suggestedLocalityId ?? "");
  const [pageNumber, setPageNumber] = useState(candidate.pageNumber?.toString() ?? "");
  const [media, setMedia] = useState<ArticleMedia[]>(
    suggestedIdsToArticleMedia(candidate.suggestedMediaAssetIds ?? []),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isPending = candidate.status === "pending";
  const suggestedAssets = (candidate.suggestedMediaAssetIds ?? [])
    .map((id) => mediaAssets.find((asset) => asset.id === id))
    .filter((asset): asset is MediaAsset => Boolean(asset));

  function buildBaseFields() {
    return {
      title: title.trim() || undefined,
      subtitle: subtitle.trim() || undefined,
      body,
      sectionId: sectionId || undefined,
      localityId: localityId || undefined,
      pageNumber: pageNumber ? Number(pageNumber) : undefined,
    };
  }

  function clearMessages(): void {
    setFormError(null);
    setSavedMessage(null);
  }

  function handleKeep(): void {
    clearMessages();
    startTransition(async () => {
      const result = await keepCandidate(candidate.id, {
        ...buildBaseFields(),
        mediaAssetIds: media.map((item) => item.mediaAssetId),
      });
      if ("error" in result) setFormError(result.error);
      else setSavedMessage("Alterações salvas. O candidato continua pendente de revisão.");
    });
  }

  function handleDiscard(): void {
    if (!window.confirm("Descartar este candidato? Ele não vira matéria.")) return;
    clearMessages();
    startTransition(async () => {
      const result = await discardCandidate(candidate.id);
      if ("error" in result) setFormError(result.error);
      else router.push(`/sistema/editorial/importar-pdf?edicao=${candidate.editionId}`);
    });
  }

  function handleSplit(): void {
    if (
      !window.confirm(
        "Dividir este candidato em dois? A divisão usa o conteúdo salvo mais recentemente — salve as alterações antes, se necessário.",
      )
    ) {
      return;
    }
    clearMessages();
    startTransition(async () => {
      const result = await splitCandidate(candidate.id);
      if ("error" in result) setFormError(result.error);
      else router.push(`/sistema/editorial/importar-pdf?edicao=${candidate.editionId}`);
    });
  }

  function handleConvert(): void {
    clearMessages();
    startTransition(async () => {
      const result = await convertCandidate(candidate.id, { ...buildBaseFields(), media });
      if ("error" in result) setFormError(result.error);
      else router.push(`/sistema/editorial/materias/${result.articleId}`);
    });
  }

  return (
    <div className="article-form">
      <section className="form-section" aria-labelledby="candidato-status-title">
        <h2 id="candidato-status-title">Origem</h2>
        <p className="helper-text">
          {editionTitle}
          {candidate.pageNumber ? ` · página sugerida ${candidate.pageNumber}` : ""} ·{" "}
          <span className={`status-pill status-pill--${isPending ? "draft" : candidate.status === "converted" ? "published" : "archived"}`}>
            {importCandidateStatusLabels[candidate.status]}
          </span>
        </p>
        {!isPending ? (
          <p className="helper-text">
            Este candidato já foi {candidate.status === "converted" ? "convertido em matéria" : "descartado"} e não pode mais ser editado aqui.
          </p>
        ) : null}
      </section>

      <section className="form-section" aria-labelledby="identificacao-title">
        <h2 id="identificacao-title">Identificação</h2>
        <div className="form-field">
          <label htmlFor="candidate-title" className="field-label">
            Título
          </label>
          <input
            id="candidate-title"
            className="field-title-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Título sugerido"
            disabled={!isPending}
          />
        </div>
        <div className="form-field">
          <label htmlFor="candidate-subtitle" className="field-label">
            Subtítulo <span className="field-optional">(opcional)</span>
          </label>
          <input
            id="candidate-subtitle"
            className="field-subtitle-input"
            value={subtitle}
            onChange={(event) => setSubtitle(event.target.value)}
            placeholder="Subtítulo sugerido"
            disabled={!isPending}
          />
        </div>
      </section>

      <section className="form-section" aria-labelledby="conteudo-title">
        <h2 id="conteudo-title">Conteúdo</h2>
        <ArticleBodyEditor value={body} onChange={setBody} />
      </section>

      <section className="form-section" aria-labelledby="classificacao-title">
        <h2 id="classificacao-title">Classificação</h2>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="candidate-section" className="field-label">
              Editoria
            </label>
            <select
              id="candidate-section"
              value={sectionId}
              onChange={(event) => setSectionId(event.target.value)}
              disabled={!isPending}
            >
              <option value="">Selecione a editoria</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="candidate-locality" className="field-label">
              Localidade
            </label>
            <select
              id="candidate-locality"
              value={localityId}
              onChange={(event) => setLocalityId(event.target.value)}
              disabled={!isPending}
            >
              <option value="">Selecione a localidade</option>
              {localities.map((locality) => (
                <option key={locality.id} value={locality.id}>
                  {locality.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="candidate-page" className="field-label">
            Página da edição <span className="field-optional">(vínculo com a edição de origem)</span>
          </label>
          <input
            id="candidate-page"
            type="number"
            min={1}
            value={pageNumber}
            onChange={(event) => setPageNumber(event.target.value)}
            disabled={!isPending}
          />
        </div>
      </section>

      <section className="form-section" aria-labelledby="imagens-title">
        <h2 id="imagens-title">Imagens</h2>
        {suggestedAssets.length > 0 ? (
          <>
            <p className="field-label">Sugeridas pela importação</p>
            <div className="suggested-media-row">
              {suggestedAssets.map((asset) => (
                <img key={asset.id} src={asset.url} alt={asset.altText ?? asset.reference} />
              ))}
            </div>
          </>
        ) : (
          <p className="helper-text">Nenhuma imagem sugerida para este candidato.</p>
        )}
        <p className="helper-text">
          Ajuste capa e galeria abaixo antes de converter — a seleção pode usar qualquer
          imagem já cadastrada, não apenas as sugeridas.
        </p>
        <ArticleMediaPicker
          mediaAssets={mediaAssets}
          media={media}
          onSetCover={(id) => setMedia((prev) => setCoverMedia(prev, id))}
          onRemoveCover={() => setMedia((prev) => removeCoverMedia(prev))}
          onAddToGallery={(id) => setMedia((prev) => addGalleryMedia(prev, id))}
          onRemoveFromGallery={(id) => setMedia((prev) => removeGalleryMedia(prev, id))}
          onMoveGalleryItem={(id, direction) => setMedia((prev) => moveGalleryMedia(prev, id, direction))}
        />
      </section>

      {candidate.extraction ? (
        <section className="form-section" aria-labelledby="origem-extracao-title">
          <h2 id="origem-extracao-title">Comparar com a origem</h2>
          <p className="helper-text">
            Método de extração: <strong>{EXTRACTION_METHOD_LABELS[candidate.extraction.method] ?? candidate.extraction.method}</strong>
          </p>
          {candidate.extraction.warnings.length > 0 ? (
            <ul className="extraction-warnings">
              {candidate.extraction.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p className="helper-text">Nenhum aviso de confiança para este candidato.</p>
          )}
          <ImportCandidateSourcePreview extraction={candidate.extraction} />
        </section>
      ) : null}

      {formError ? (
        <p className="form-error" role="alert">
          {formError}
        </p>
      ) : null}
      {savedMessage ? <p className="helper-text">{savedMessage}</p> : null}

      {isPending ? (
        <div className="form-actions">
          <button type="button" onClick={handleKeep} disabled={pending}>
            Manter
          </button>
          <button
            type="button"
            className="form-action-primary"
            onClick={handleConvert}
            disabled={pending}
          >
            Converter em rascunho
          </button>
          <button type="button" onClick={handleSplit} disabled={pending}>
            Dividir candidato
          </button>
          <button type="button" className="form-action-danger" onClick={handleDiscard} disabled={pending}>
            Descartar
          </button>
        </div>
      ) : null}
    </div>
  );
}
