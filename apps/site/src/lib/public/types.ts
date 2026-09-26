import type { EditorialPlacementType } from "@ir/types";

export interface PublicSection {
  id: string;
  slug: string;
  name: string;
}

export interface PublicLocality {
  id: string;
  slug: string;
  name: string;
  scope: string;
}

export interface PublicArticleMedia {
  mediaId: string;
  role: "cover" | "gallery";
  order: number;
  url: string;
  altText?: string;
  caption?: string;
  credit?: string;
}

/**
 * Matéria pública real (Fase 30) — só os campos que o portal usa de
 * verdade (item 5). Nada de `created_by`/`internal_reference`/etc.
 */
export interface PublicArticle {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  body: string;
  sectionId: string;
  sectionName: string;
  sectionSlug: string;
  localityId: string;
  localityName: string;
  urgent: boolean;
  publishedAt: string;
  cover?: PublicArticleMedia;
  gallery: PublicArticleMedia[];
}

export type PublicPlacementType = Exclude<EditorialPlacementType, "none">;
