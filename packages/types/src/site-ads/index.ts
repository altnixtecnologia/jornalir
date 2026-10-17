// Patrocinadores do site — 6 posições fixas, cada uma com a própria
// playlist, tempo, efeito e modo de encaixe.

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

export type SiteAdSlotTransitionEffect =
  | "none"
  | "fade"
  | "slide-left"
  | "slide-up"
  | "zoom-in"
  | "crossfade";

export const SITE_AD_SLOT_TRANSITION_EFFECTS: readonly SiteAdSlotTransitionEffect[] = [
  "none",
  "fade",
  "slide-left",
  "slide-up",
  "zoom-in",
  "crossfade",
];

export const SITE_AD_SLOT_TRANSITION_EFFECT_LABELS: Record<SiteAdSlotTransitionEffect, string> = {
  none: "Sem efeito",
  fade: "Fade suave",
  "slide-left": "Deslizar",
  "slide-up": "Subir",
  "zoom-in": "Zoom suave",
  crossfade: "Crossfade",
};

export type SiteAdFitMode = "contain" | "stretch";

export const SITE_AD_FIT_MODE_LABELS: Record<SiteAdFitMode, string> = {
  contain: "Ajustar para caber",
  stretch: "Esticar para preencher",
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
  rotationIntervalMs: number;
  transitionEffect: SiteAdSlotTransitionEffect;
  fitMode: SiteAdFitMode;
  createdAt: string;
  updatedAt: string;
}

export interface SiteAdMedia {
  id: string;
  slotId: string;
  mediaAssetId: string;
  clientId?: string;
  href?: string;
  altText?: string;
  active: boolean;
  activeFrom?: string;
  activeUntil?: string;
  sortOrder: number;
  /** Override individual — ausente/undefined usa o valor da posição (SiteAdSlot). */
  rotationIntervalMs?: number;
  transitionEffect?: SiteAdSlotTransitionEffect;
  fitMode?: SiteAdFitMode;
  createdByProfileId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SiteAdMediaWithAsset extends SiteAdMedia {
  imageUrl: string;
  mediaAssetAltText?: string;
  clientName?: string;
}

export interface SiteAdSlotWithMedia extends SiteAdSlot {
  media: SiteAdMediaWithAsset[];
}

export function isSiteAdMediaCurrentlyActive(
  media: Pick<SiteAdMedia, "active" | "activeFrom" | "activeUntil">,
  today: Date = new Date(),
): boolean {
  if (!media.active) return false;
  const reference = new Date(today);
  reference.setHours(0, 0, 0, 0);
  if (media.activeFrom && new Date(media.activeFrom + "T00:00:00") > reference) return false;
  if (media.activeUntil && new Date(media.activeUntil + "T00:00:00") < reference) return false;
  return true;
}

export interface PublicSiteAdMedia {
  slotNumber: number;
  id: string;
  imageUrl: string;
  altText?: string;
  href?: string;
  sortOrder: number;
  rotationIntervalMs: number;
  transitionEffect: SiteAdSlotTransitionEffect;
  fitMode: SiteAdFitMode;
}

export interface PublicSiteAdSettings {
  rotationIntervalMs: number;
  transitionEffect: SiteAdTransitionEffect;
}
