// Patrocinadores do site — as 6 posições laterais do portal público
// (Fase 6 da rodada "Comercial completo"). Domínio DELIBERADAMENTE
// separado de Comercial/Publicidade (commercial_sales/proposals): isto
// é um BENEFÍCIO/BRINDE para quem anuncia no jornal impresso, nunca uma
// venda — nenhum campo aqui gera cobrança/Financeiro/NFS-e.

export type SiteAdTransitionEffect =
  | "fade"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "zoom-in"
  | "zoom-out"
  | "blur-fade"
  | "scale-fade"
  | "crossfade";

export const SITE_AD_TRANSITION_EFFECTS: readonly SiteAdTransitionEffect[] = [
  "fade",
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "zoom-in",
  "zoom-out",
  "blur-fade",
  "scale-fade",
  "crossfade",
];

export const SITE_AD_TRANSITION_EFFECT_LABELS: Record<SiteAdTransitionEffect, string> = {
  fade: "Fade",
  "slide-left": "Deslizar da direita",
  "slide-right": "Deslizar da esquerda",
  "slide-up": "Deslizar de baixo",
  "slide-down": "Deslizar de cima",
  "zoom-in": "Zoom (aproximar)",
  "zoom-out": "Zoom (afastar)",
  "blur-fade": "Fade com desfoque",
  "scale-fade": "Fade com escala",
  crossfade: "Crossfade",
};

export interface SiteAdSettings {
  id: string;
  rotationIntervalMs: number;
  transitionEffect: SiteAdTransitionEffect;
  createdAt: string;
  updatedAt: string;
}

export const SITE_AD_DEFAULT_ROTATION_INTERVAL_MS = 10000;

export interface SiteAdSlot {
  id: string;
  slotNumber: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SiteAdMedia {
  id: string;
  slotId: string;
  mediaAssetId: string;
  /** "Patrocinador" opcional — só identificação, nunca uma obrigação financeira (ver Comercial/Publicidade para isso). */
  clientId?: string;
  href?: string;
  /** Sobrescreve o alt text padrão do media_asset, quando preenchido. */
  altText?: string;
  active: boolean;
  activeFrom?: string;
  activeUntil?: string;
  sortOrder: number;
  createdByProfileId?: string;
  createdAt: string;
  updatedAt: string;
}

/** SiteAdMedia + o que a tela de gestão precisa pra exibir sem outra consulta. */
export interface SiteAdMediaWithAsset extends SiteAdMedia {
  imageUrl: string;
  mediaAssetAltText?: string;
  clientName?: string;
}

export interface SiteAdSlotWithMedia extends SiteAdSlot {
  media: SiteAdMediaWithAsset[];
}

/** "Vigente hoje" — nunca gravado, sempre derivado (mesmo princípio de computeReceivableDueFlag/isCommercialProposalExpired). */
export function isSiteAdMediaCurrentlyActive(media: Pick<SiteAdMedia, "active" | "activeFrom" | "activeUntil">, today: Date = new Date()): boolean {
  if (!media.active) return false;
  const reference = new Date(today);
  reference.setHours(0, 0, 0, 0);
  if (media.activeFrom && new Date(`${media.activeFrom}T00:00:00`) > reference) return false;
  if (media.activeUntil && new Date(`${media.activeUntil}T00:00:00`) < reference) return false;
  return true;
}

/** Fixture pública mínima (preview/fallback do site) — mesmo contrato da view public_site_ad_media. */
export interface PublicSiteAdMedia {
  slotNumber: number;
  id: string;
  imageUrl: string;
  altText?: string;
  href?: string;
  sortOrder: number;
}

export interface PublicSiteAdSettings {
  rotationIntervalMs: number;
  transitionEffect: SiteAdTransitionEffect;
}
