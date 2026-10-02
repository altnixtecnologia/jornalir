"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { EDITORIAL_PLACEMENT_LIMITS, type Article, type EditorialPlacementType, type EditorialSection, type Locality, type MediaAsset } from "@ir/types";
import {
  removeFromPlacementAction,
  reorderPinnedPlacementAction,
  setPlacementPinnedAction,
} from "../../app/sistema/editorial/destaques/actions";
import { placementLabels, publicationDate } from "./editorialLabels";

type PlacementKey = Exclude<EditorialPlacementType, "none">;

interface DestaquesManagerProps {
  placements: Record<PlacementKey, Article[]>;
  sections: EditorialSection[];
  localities: Locality[];
  mediaAssets: MediaAsset[];
}

const BLOCK_ORDER: PlacementKey[] = ["mainCover", "highlightStrip", "latestNews", "localSpotlight"];

export function DestaquesManager({ placements, sections, localities, mediaAssets }: DestaquesManagerProps): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dragged, setDragged] = useState<{ type: PlacementKey; articleId: string } | null>(null);

  const sectionById = useMemo(() => new Map(sections.map((section) => [section.id, section])), [sections]);
  const localityById = useMemo(() => new Map(localities.map((locality) => [locality.id, locality])), [localities]);
  const mediaById = useMemo(() => new Map(mediaAssets.map((asset) => [asset.id, asset])), [mediaAssets]);

  function coverUrl(article: Article): string | undefined {
    const cover = article.media.find((item) => item.role === "cover");
    return cover ? mediaById.get(cover.mediaAssetId)?.url : undefined;
  }

  function handleTogglePinned(article: Article, activePinned: boolean): void {
    setError(null);
    startTransition(async () => {
      const result = await setPlacementPinnedAction(article.id, !activePinned);
      if ("error" in result) setError(result.error);
    });
  }

  function handleRemove(article: Article): void {
    if (!window.confirm(`Remover "${article.title}" desta posição? A matéria continua publicada normalmente.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await removeFromPlacementAction(article.id);
      if ("error" in result) setError(result.error);
    });
  }

  function handleDropPinned(
    type: PlacementKey,
    pinnedIds: string[],
    targetArticleId: string,
    placement: "before" | "after",
  ): void {
    if (!dragged || dragged.type !== type || dragged.articleId === targetArticleId) return;
    const reordered = pinnedIds.filter((id) => id !== dragged.articleId);
    const targetIndex = reordered.indexOf(targetArticleId);
    if (targetIndex < 0) return;
    reordered.splice(targetIndex + (placement === "after" ? 1 : 0), 0, dragged.articleId);
    setDragged(null);
    setError(null);
    startTransition(async () => {
      const result = await reorderPinnedPlacementAction(type, reordered);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="destaques-grid">
        {BLOCK_ORDER.map((type) => {
          const articles = placements[type];
          const limit = EDITORIAL_PLACEMENT_LIMITS[type];
          const isSpotlight = type === "localSpotlight";
          const nowIso = new Date().toISOString();
          const isPinnedActive = (article: Article): boolean =>
            Boolean(article.placement.pinned) &&
            (!article.placement.endsAt || article.placement.endsAt >= nowIso);
          const pinnedIds = articles.filter(isPinnedActive).map((article) => article.id);

          return (
            <section key={type} className="form-section destaques-block" aria-labelledby={`destaque-${type}-title`}>
              <div className="destaques-block-head">
                <h2 id={`destaque-${type}-title`}>{placementLabels[type]}</h2>
                <span className="materias-count">
                  {articles.length} / {limit} vaga(s)
                </span>
              </div>

              {articles.length === 0 ? (
                <p className="helper-text">Nenhuma matéria nesta posição agora.</p>
              ) : (
                <ul className={`destaques-list${isSpotlight ? " destaques-list--grid" : ""}`}>
                  {articles.map((article) => {
                    const section = sectionById.get(article.sectionId);
                    const locality = localityById.get(article.localityId);
                    const cover = coverUrl(article);
                    const pinned = isPinnedActive(article);

                    return (
                      <li
                        key={article.id}
                        className={`destaques-item${dragged?.articleId === article.id ? " is-dragging" : ""}`}
                        onDragOver={(event) => {
                          if (!pinned || !dragged || dragged.type !== type) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (!pinned) return;
                          const bounds = event.currentTarget.getBoundingClientRect();
                          const placement = event.clientY > bounds.top + bounds.height / 2 ? "after" : "before";
                          handleDropPinned(type, pinnedIds, article.id, placement);
                        }}
                      >
                        {cover ? (
                          <img src={cover} alt="" className="destaques-item-thumb" />
                        ) : (
                          <span className="destaques-item-thumb destaques-item-thumb--empty" aria-hidden="true" />
                        )}
                        <div className="destaques-item-body">
                          <Link className="materia-title" href={`/sistema/editorial/materias/${article.id}`}>
                            {article.title}
                          </Link>
                          <span className="helper-text">
                            {section?.name ?? "Editoria removida"} · {locality?.name ?? "Localidade removida"} ·{" "}
                            {publicationDate(article)}
                          </span>
                          {pinned ? <span className="status-pill status-pill--published">Fixada</span> : null}
                        </div>
                        <div className="destaques-item-actions">
                          {pinned ? (
                            <button
                              type="button"
                              className="destaques-drag-handle"
                              draggable={!pending}
                              onDragStart={(event) => {
                                setDragged({ type, articleId: article.id });
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", article.id);
                              }}
                              onDragEnd={() => setDragged(null)}
                              disabled={pending}
                              title="Arraste para ordenar as matérias fixadas"
                              aria-label={`Arrastar ${article.title} para reordenar`}
                            >
                              ⋮⋮
                            </button>
                          ) : null}
                          <button type="button" onClick={() => handleTogglePinned(article, pinned)} disabled={pending}>
                            {pinned ? "Desafixar" : "Fixar"}
                          </button>
                          <button
                            type="button"
                            className="media-remove-button"
                            onClick={() => handleRemove(article)}
                            disabled={pending}
                          >
                            Remover
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
