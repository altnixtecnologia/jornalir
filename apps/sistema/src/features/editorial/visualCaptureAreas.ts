import type { RegionArticleExtraction } from "@ir/pdf-extraction";

/**
 * Combina a extração de cada ÁREA de uma mesma matéria (captura visual) —
 * o operador pode marcar mais de uma região, inclusive em páginas
 * diferentes, para texto em múltiplas colunas/continuação (item 6 do
 * pedido). Cada área já foi analisada isoladamente por
 * `extractArticleFromRegion` (`@ir/pdf-extraction`, o mesmo motor
 * calibrado do extrator); esta função só decide como juntar os resultados
 * na ordem em que o operador selecionou, sem nenhuma heurística de
 * título/corpo própria.
 *
 * Regra: o título/subtítulo vêm sempre da PRIMEIRA área (o fluxo esperado
 * é selecionar a matéria inteira primeiro e só depois acrescentar
 * continuação). Um título reconhecido numa área seguinte nunca substitui o
 * da primeira — entra no corpo, com aviso, para revisão humana (nunca
 * perder texto selecionado).
 */
export interface CombinedCapture {
  title: string;
  subtitle: string;
  /** Parágrafos de corpo já na ordem das áreas selecionadas. */
  bodyParagraphs: string[];
  needsReview: boolean;
  warnings: string[];
}

export function combineAreaExtractions(perArea: RegionArticleExtraction[], areaLabels: string[]): CombinedCapture {
  if (perArea.length === 0) {
    return { title: "", subtitle: "", bodyParagraphs: [], needsReview: true, warnings: ["Nenhuma área selecionada."] };
  }

  const [first, ...rest] = perArea;
  const bodyParagraphs = [...first.bodyParagraphs];
  const warnings = withLabel(first.warnings, areaLabels[0]);
  let needsReview = first.needsReview;

  rest.forEach((extraction, index) => {
    const label = areaLabels[index + 1] ?? `área ${index + 2}`;
    if (extraction.title) {
      // Nunca descartado: um título inesperado numa área de continuação
      // entra no corpo, igual a qualquer outro texto não associado.
      bodyParagraphs.push(extraction.title);
      warnings.push(`${label}: um título foi reconhecido nesta área além da primeira — confira se pertence à mesma matéria.`);
      needsReview = true;
    }
    if (extraction.subtitle) bodyParagraphs.push(extraction.subtitle);
    bodyParagraphs.push(...extraction.bodyParagraphs);
    warnings.push(...withLabel(extraction.warnings, label));
    if (extraction.needsReview) needsReview = true;
  });

  return { title: first.title, subtitle: first.subtitle, bodyParagraphs, needsReview, warnings };
}

function withLabel(warnings: string[], label: string | undefined): string[] {
  if (!label) return warnings;
  return warnings.map((warning) => (warning.startsWith(label) ? warning : `${label}: ${warning}`));
}


/** Uma matéria pode reunir trechos de várias páginas. A função abaixo
 * acrescenta o trecho à MESMA matéria (id/cor/título preservados) e retorna
 * null se a nova região não trouxe texto; assim não surge um retângulo
 * visual sem vínculo com a matéria. */
export interface CaptureArea { page: number; rect: { x: number; y: number; width: number; height: number }; }

export interface CaptureForAppend {
  areas: CaptureArea[];
  perAreaExtraction: RegionArticleExtraction[];
  title: string;
  subtitle: string;
  body: string;
  needsReview: boolean;
  warnings: string[];
}

export function appendRegionToCapture<T extends CaptureForAppend>(
  capture: T,
  area: CaptureArea,
  extraction: RegionArticleExtraction,
): T | null {
  const parts = [extraction.title, extraction.subtitle, ...extraction.bodyParagraphs]
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const pageLabel = `Página ${area.page}`;
  const warnings = extraction.warnings.map((warning) => `${pageLabel}: ${warning}`);
  if (extraction.title) {
    warnings.push(`${pageLabel}: um título foi reconhecido no trecho adicional; confira se pertence à mesma matéria.`);
  }
  return {
    ...capture,
    areas: [...capture.areas, area],
    perAreaExtraction: [...capture.perAreaExtraction, extraction],
    body: [capture.body.trim(), parts.join("\n\n")].filter(Boolean).join("\n\n"),
    needsReview: capture.needsReview || extraction.needsReview || Boolean(extraction.title),
    warnings: [...capture.warnings, ...warnings],
  };
}
