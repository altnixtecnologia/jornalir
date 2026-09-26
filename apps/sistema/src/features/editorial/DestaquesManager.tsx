"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { Article, EditorialPlacementType, EditorialSection, Locality, MediaAsset } from "@ir/types";
import {
  removeFromPlacementAction,
  reorderPinnedMainCoverAction,
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

const PLACEMENT_LIMITS: Record<PlacementKey, number> = {
  mainCover: 8,
  highlightStrip: 3,
  latestNews: 7,
  localSpotlight: 4,
};

const BLOCK_ORDER: PlacementKey[] = ["mainCover", "highlightStrip", "latestNews", "localSpotlight"];

export function DestaquesManager({ placements, sections, localities, mediaAssets }: DestaquesManagerProps): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sectionById = useMemo(() => new Map(sections.map((section) => [section.id, section])), [sections]);
  const localityById = useMemo(() => new Map(localities.map((locality) => [locality.id, locality])), [localities]);
  const mediaById = useMemo(() => new Map(mediaAssets.map((asset) => [asset.id, asset])), [mediaAssets]);

  function coverUrl(article: Article): string | undefined {
    const cover = article.media.find((item) => item.role === "cover");
    return cover ? mediaById.get(cover.mediaAssetId)?.url : undefined;
  }

  function handleTogglePinned(article: Article): void {
    setError(null);
    startTransition(async () => {
      const result = await setPlacementPinnedAction(article.id, !article.placement.pinned);
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

  function handleMovePinned(pinnedIds: string[], index: number, direction: -1 | 1): void {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= pinnedIds.length) return;
    const reordered = [...pinnedIds];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    setError(null);
    startTransition(async () => {
      const result = await reorderPinnedMainCoverAction(reordered);
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
          const limit = PLACEMENT_LIMITS[type];
          const pinnedIds = articles.filter((article) => article.placement.pinned).map((article) => article.id);

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
                <ul className="destaques-list">
                  {articles.map((article) => {
                    const section = sectionById.get(article.sectionId);
                    const locality = localityById.get(article.localityId);
                    const cover = coverUrl(article);
                    const pinned = Boolean(article.placement.pinned);
                    const pinnedIndex = pinnedIds.indexOf(article.id);

                    return (
                      <li key={article.id} className="destaques-item">
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
                          {type === "mainCover" ? (
                            <button type="button" onClick={() => handleTogglePinned(article)} disabled={pending}>
                              {pinned ? "Desafixar" : "Fixar"}
                            </button>
                          ) : null}
                          {type === "mainCover" && pinned ? (
                            <div className="reorder-buttons">
                              <button
                                type="button"
                                onClick={() => handleMovePinned(pinnedIds, pinnedIndex, -1)}
                                disabled={pending || pinnedIndex === 0}
                                aria-label={`Mover ${article.title} para cima`}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMovePinned(pinnedIds, pinnedIndex, 1)}
                                disabled={pending || pinnedIndex === pinnedIds.length - 1}
                                aria-label={`Mover ${article.title} para baixo`}
                              >
                                ↓
                              </button>
                            </div>
                          ) : null}
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
