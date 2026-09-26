const WORDS_PER_MINUTE = 200;

/**
 * Tempo de leitura estimado a partir do corpo (HTML) da matéria — sempre
 * derivado do conteúdo, nunca um campo salvo à parte (Fase 29, item 6):
 * remove as tags, conta palavras, divide pela velocidade média de leitura.
 * Mínimo de 1 min mesmo para textos muito curtos.
 */
export function estimateReadingMinutes(html: string): number {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return 1;
  const wordCount = text.split(" ").length;
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}

export function readingTimeLabel(minutes: number): string {
  return `${minutes} min de leitura`;
}
