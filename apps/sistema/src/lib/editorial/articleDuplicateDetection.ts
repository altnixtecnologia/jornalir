import { normalizeForSearch } from "../fuzzySearch";

export interface DuplicateArticleCandidate {
  id: string;
  title: string;
  /** HTML (mesma convenção do corpo do candidato/matéria) ou texto puro — ambos aceitos, tags são removidas antes de comparar. */
  body?: string;
  status: string;
}

export type DuplicateMatchReason = "title" | "content" | "title_and_content";

export interface DuplicateArticleMatch {
  articleId: string;
  title: string;
  status: string;
  score: number;
  reason: DuplicateMatchReason;
}

const TITLE_MIN_SCORE = 0.5;
const CONTENT_MIN_SCORE = 0.3;
const TITLE_MIN_WORD_LENGTH = 3;
const CONTENT_MIN_WORD_LENGTH = 4;
const MAX_MATCHES = 5;

/** Palavras curtas e conectivos muito comuns em português — descartados só
 * na comparação de CONTEÚDO (o título já é curto o bastante para não
 * precisar disso); sem isso, textos sem nenhuma relação real tendem a
 * "casar" só por compartilharem artigos/preposições comuns. */
const CONTENT_STOPWORDS = new Set([
  "para","com","como","mais","pela","pelo","pelos","pelas","esse","essa","esses","essas",
  "isso","aquele","aquela","aqueles","aquelas","este","esta","estes","estas","isto",
  "foram","será","serão","estão","está","tem","têm","não","sim","já","até","seu","sua",
  "seus","suas","nosso","nossa","nossos","nossas","entre","após","sobre","quando","onde",
  "muito","também","ainda","também","porque","porém","mas","mesmo","todo","toda","todos",
  "todas","outro","outra","outros","outras","ser","estar","haver","ter","fazer","disse",
  "segundo","durante","desde","sendo","sido","deste","desta","destes","destas","naquele",
  "naquela","dele","dela","deles","delas","você","vocês","nós","eles","elas","ele","ela",
]);

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function significantWords(value: string, minLength: number, stopwords?: Set<string>): Set<string> {
  return new Set(
    normalizeForSearch(stripHtml(value))
      .split(" ")
      .filter((word) => word.length >= minLength && !stopwords?.has(word)),
  );
}

function overlapScore(wordsA: Set<string>, wordsB: Set<string>): number {
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let shared = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) shared += 1;
  }
  return shared / Math.max(wordsA.size, wordsB.size);
}

function titleOverlapScore(a: string, b: string): number {
  return overlapScore(
    significantWords(a, TITLE_MIN_WORD_LENGTH),
    significantWords(b, TITLE_MIN_WORD_LENGTH),
  );
}

function contentOverlapScore(a: string, b: string): number {
  return overlapScore(
    significantWords(a, CONTENT_MIN_WORD_LENGTH, CONTENT_STOPWORDS),
    significantWords(b, CONTENT_MIN_WORD_LENGTH, CONTENT_STOPWORDS),
  );
}

/**
 * Compara um candidato extraído do PDF (título + corpo) contra matérias já
 * existentes no portal — inclusive publicadas antes da edição impressa
 * (nenhum filtro de status/data aqui; quem chama decide o universo de
 * comparação). Além do título, compara o CONTEÚDO textual: duas matérias
 * com títulos diferentes mas o mesmo texto (reaproveitamento, texto de
 * assessoria replicado, etc.) também são sinalizadas.
 *
 * Solução simples e determinística (sobreposição de palavras
 * significativas, sem IA/API externa paga) — só sinaliza a possível
 * correspondência pro operador avaliar; nunca decide, mescla, descarta ou
 * despublica nada por conta própria.
 */
export function findPossibleDuplicateArticles(
  candidateTitle: string | undefined,
  candidateBody: string | undefined,
  articles: readonly DuplicateArticleCandidate[],
): DuplicateArticleMatch[] {
  const hasTitle = Boolean(candidateTitle?.trim());
  const hasBody = Boolean(candidateBody?.trim());
  if (!hasTitle && !hasBody) return [];

  return articles
    .map((article) => {
      const titleScore = hasTitle ? titleOverlapScore(candidateTitle as string, article.title) : 0;
      const contentScore =
        hasBody && article.body ? contentOverlapScore(candidateBody as string, article.body) : 0;
      const titleMatches = titleScore >= TITLE_MIN_SCORE;
      const contentMatches = contentScore >= CONTENT_MIN_SCORE;
      const reason: DuplicateMatchReason | null = titleMatches && contentMatches
        ? "title_and_content"
        : titleMatches
          ? "title"
          : contentMatches
            ? "content"
            : null;
      return {
        articleId: article.id,
        title: article.title,
        status: article.status,
        score: Math.max(titleScore, contentScore),
        reason,
      };
    })
    .filter((match): match is DuplicateArticleMatch & { reason: DuplicateMatchReason } => match.reason !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHES);
}
