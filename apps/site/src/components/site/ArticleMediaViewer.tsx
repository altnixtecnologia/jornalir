"use client";

import { useState } from "react";
import { ArticleGallery } from "./ArticleGallery";
import type { ArticleImage } from "./siteArticleTypes";

/**
 * Capa + corpo + galeria de uma matéria, com capa e galeria unificadas num
 * único visualizador (Fase 49, item 3): a capa é clicável, o indicador
 * "Ver N fotos" e as miniaturas da galeria abrem o MESMO lightbox, sempre
 * com a capa no índice 0. Corpo fica entre a capa e a galeria (ordem visual
 * já usada na página), por isso os três vivem juntos aqui, com o estado do
 * lightbox (`openIndex`) num único lugar.
 *
 * A capa nunca é cortada (item 4): `object-contain` com fundo neutro, nunca
 * `object-cover`/`bg-cover`.
 */
export function ArticleMediaViewer({
  cover,
  coverCredit,
  gallery,
  bodyHtml,
}: {
  cover?: ArticleImage;
  coverCredit?: string;
  gallery: ArticleImage[];
  bodyHtml: string;
}): JSX.Element {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const combined = cover ? [cover, ...gallery] : gallery;
  const totalPhotos = combined.length;

  return (
    <>
      {cover ? (
        <figure className="relative mt-6">
          <button
            type="button"
            className="block w-full cursor-zoom-in border-0 bg-transparent p-0"
            onClick={() => setOpenIndex(0)}
            aria-label="Ampliar foto de capa"
          >
            <img
              src={cover.url}
              alt={cover.caption ?? ""}
              className="max-h-[70vh] w-full rounded-sm bg-[color:var(--site-bg)] object-contain"
            />
          </button>
          {gallery.length > 0 ? (
            <button type="button" className="gallery-indicator" onClick={() => setOpenIndex(0)}>
              <span aria-hidden="true">▦</span> Ver {totalPhotos} fotos
            </button>
          ) : null}
          {coverCredit ? (
            <figcaption className="mt-2 text-right text-[11px] text-[color:var(--site-muted)]">Foto: {coverCredit}</figcaption>
          ) : null}
        </figure>
      ) : null}

      <div className="article-body mt-8" dangerouslySetInnerHTML={{ __html: bodyHtml }} />

      {gallery.length > 0 ? (
        <div id="article-gallery" className="mt-10 scroll-mt-24">
          <ArticleGallery
            images={combined}
            thumbnailStart={cover ? 1 : 0}
            openIndex={openIndex}
            onOpenIndexChange={setOpenIndex}
          />
        </div>
      ) : null}
    </>
  );
}
