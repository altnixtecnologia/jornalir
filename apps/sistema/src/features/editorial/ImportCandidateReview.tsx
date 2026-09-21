"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ArticleMedia, EditorialSection, ImportCandidate, Locality, MediaAsset, NewspaperEdition } from "@ir/types";
import {
  convertCandidate,
  discardCandidate,
  keepCandidate,
  splitCandidate,
} from "../../app/sistema/editorial/importar-pdf/actions";
import { ArticleBodyEditor } from "./ArticleBodyEditor";
import { ArticleMediaPicker } from "./ArticleMediaPicker";
import { DestinoEditorial } from "./DestinoEditorial";
import { ImportCandidateSourcePreview } from "./ImportCandidateSourcePreview";
import {
  addGalleryMedia,
  moveGalleryMedia,
  removeCoverMedia,
  removeGalleryMedia,
  setCoverMedia,
  setMediaCaption,
  setMediaCredit,
  suggestedIdsToArticleMedia,
} from "./articleMediaState";
import { editionPageLabel, importCandidateStatusLabels } from "./editorialLabels";

const EXTRACTION_METHOD_LABELS: Record<string, string> = {
  textLayer: "Camada de texto do PDF",
  ocr: "OCR (reconhecimento óptico)",
  manual: "Entrada manual",
};

interface ImportCandidateReviewProps {
  candidate: ImportCandidate;
  editionTitle: string;
  edition?: NewspaperEdition;
  sections: EditorialSection[];
  localities: Locality[];
  mediaAssets: MediaAsset[];
}

export function ImportCandidateReview({
  candidate,
  editionTitle,
  edition,
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
  const [availableMediaAssets, setAvailableMediaAssets] = useState<MediaAsset[]>(mediaAssets);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isPending = candidate.status === "pending";
  const availableSections = sections.filter((section) => section.active || section.id === candidate.suggestedSectionId);
  const availableLocalities = localities.filter(
    (locality) => locality.active || locality.id === candidate.suggestedLocalityId,
  );
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
        {candidate.status === "converted" && candidate.createdArticleId ? (
          <p className="helper-text">
            Matéria já criada a partir deste candidato — convertê-lo de novo não é possível.{" "}
            <Link className="section-more" href={`/sistema/editorial/materias/${candidate.createdArticleId}`}>
              Abrir a matéria →
            </Link>
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
              {availableSections.map((section) => (
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
              {availableLocalities.map((locality) => (
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

      <DestinoEditorial
        sectionName={sections.find((section) => section.id === sectionId)?.name}
        localityName={localities.find((locality) => locality.id === localityId)?.name}
        placementType="none"
        notificationMode="none"
        publicationLine={
          isPending
            ? "Ao converter, nasce como rascunho — destaque, notificação e publicação/agendamento são decididos na edição da matéria."
            : "Este candidato já foi processado — veja a matéria criada (ou a informação de mesclagem) acima."
        }
        editionLine={editionPageLabel(editionTitle, pageNumber ? Number(pageNumber) : candidate.pageNumber)}
        digitalEditionUrl={edition?.pdfUrl}
      />

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
          mediaAssets={availableMediaAssets}
          media={media}
          onSetCover={(id) => setMedia((prev) => setCoverMedia(prev, id))}
          onRemoveCover={() => setMedia((prev) => removeCoverMedia(prev))}
          onAddToGallery={(id) => setMedia((prev) => addGalleryMedia(prev, id))}
          onRemoveFromGallery={(id) => setMedia((prev) => removeGalleryMedia(prev, id))}
          onMoveGalleryItem={(id, direction) => setMedia((prev) => moveGalleryMedia(prev, id, direction))}
          onSetCaption={(id, caption) => setMedia((prev) => setMediaCaption(prev, id, caption))}
          onSetCredit={(id, credit) => setMedia((prev) => setMediaCredit(prev, id, credit))}
          onFilesUploaded={(uploaded) => {
            setAvailableMediaAssets((prev) => [...uploaded, ...prev]);
            setMedia((prev) => {
              let next = prev;
              for (const asset of uploaded) {
                next = next.some((item) => item.role === "cover")
                  ? addGalleryMedia(next, asset.id)
                  : setCoverMedia(next, asset.id);
              }
              return next;
            });
          }}
        />
      </section>

      {candidate.extraction ? (
        <section className="form-section" aria-labelledby="origem-extracao-title">
          <h2 id="origem-extracao-title">Comparar com a origem</h2>
          <p className="helper-text">
            Método de extração: <strong>{EXTRACTION_METHOD_LABELS[candidate.extraction.method] ?? candidate.extraction.method}</strong>
          </p>
          <p className="coverage-line">
            <span
              className={`coverage-badge${candidate.extraction.pageCoverage.coverageByChars < 1 ? " coverage-badge--warning" : ""}`}
            >
              Cobertura da página: {(candidate.extraction.pageCoverage.coverageByChars * 100).toFixed(0)}%
            </span>
            <span className="helper-text">
              {candidate.extraction.pageCoverage.blocksUsed} de {candidate.extraction.pageCoverage.blocksFound} bloco(s) da camada de texto usados nesta página
              {candidate.extraction.pageCoverage.orphanBlocks > 0
                ? ` · ${candidate.extraction.pageCoverage.orphanBlocks} bloco(s) não associado(s) a nenhum candidato`
                : ""}
            </span>
          </p>
          {candidate.extraction.pageCoverage.orphanBlocks > 0 || candidate.extraction.pageCoverage.coverageByChars < 1 ? (
            <p className="coverage-risk" role="alert">
              Risco de perda de texto nesta página: nem todo o conteúdo da camada textual foi associado a um candidato. Confira o PDF original antes de descartar esta página como concluída.
            </p>
          ) : null}
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
