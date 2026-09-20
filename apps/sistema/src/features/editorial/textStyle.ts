import type { CSSProperties } from "react";
import type { EditorialEmphasis, EditorialTextSize, EditorialTextStyle } from "@ir/types";

export const DEFAULT_TEXT_STYLE: EditorialTextStyle = {
  bold: false,
  italic: false,
  size: "default",
  emphasis: "normal",
};

export const TEXT_SIZE_LABELS: Record<EditorialTextSize, string> = {
  default: "Padrão",
  large: "Grande",
  xlarge: "Extra grande",
};

export const TEXT_EMPHASIS_LABELS: Record<EditorialEmphasis, string> = {
  normal: "Normal",
  medium: "Média",
  strong: "Forte",
};

const EMPHASIS_WEIGHT: Record<EditorialEmphasis, number> = {
  normal: 400,
  medium: 600,
  strong: 700,
};

const TITLE_SIZE_PX: Record<EditorialTextSize, number> = {
  default: 22,
  large: 28,
  xlarge: 34,
};

const SUBTITLE_SIZE_PX: Record<EditorialTextSize, number> = {
  default: 15,
  large: 18,
  xlarge: 21,
};

export function isDefaultTextStyle(style: EditorialTextStyle): boolean {
  return (
    !style.bold &&
    !style.italic &&
    style.size === DEFAULT_TEXT_STYLE.size &&
    style.emphasis === DEFAULT_TEXT_STYLE.emphasis
  );
}

/** Converte os ajustes pontuais de título/subtítulo em estilo inline para o campo. */
export function textStyleToCss(
  style: EditorialTextStyle,
  variant: "title" | "subtitle",
): CSSProperties {
  const sizesInPx = variant === "title" ? TITLE_SIZE_PX : SUBTITLE_SIZE_PX;
  return {
    fontWeight: style.bold ? 700 : EMPHASIS_WEIGHT[style.emphasis],
    fontStyle: style.italic ? "italic" : "normal",
    fontSize: `${sizesInPx[style.size]}px`,
  };
}
