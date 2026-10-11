/**
 * Busca tolerante a erro, sem biblioteca (auditei o projeto antes: não
 * existia nenhum helper de fuzzy search). Normalização + distância de
 * edição (Levenshtein) local — volume deste módulo (dezenas/centenas de
 * nomes) não justifica dependência nenhuma, muito menos IA/chamada externa.
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[rows - 1][cols - 1];
}

/** Distância máxima tolerada, proporcional ao tamanho da palavra mais curta. */
function maxDistanceFor(wordLength: number): number {
  if (wordLength <= 3) return 0;
  if (wordLength <= 6) return 1;
  return 2;
}

/**
 * true quando `query` razoavelmente corresponde a `target` — tolera
 * ausência de acento, diferença de caixa, espaço extra, trecho
 * incompleto (substring) e pequeno erro de digitação (Levenshtein por
 * palavra). Vazio sempre casa com tudo (sem filtro).
 */
export function fuzzyMatches(query: string, target: string): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  const t = normalizeForSearch(target);
  if (t.includes(q)) return true;

  const queryWords = q.split(" ").filter(Boolean);
  const targetWords = t.split(" ").filter(Boolean);

  return queryWords.every((qWord) =>
    targetWords.some((tWord) => {
      if (tWord.includes(qWord) || qWord.includes(tWord)) return true;
      const shortest = Math.min(qWord.length, tWord.length);
      return levenshtein(qWord, tWord) <= maxDistanceFor(shortest);
    }),
  );
}
