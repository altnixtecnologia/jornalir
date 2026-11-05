/**
 * Reconhecimento (não produção) da data real de publicação de uma edição a
 * partir do texto já extraído da página 1/2 do PDF (via @ir/pdf-extraction).
 * FUNÇÃO PURA: não acessa R2, Supabase nem sistema de arquivos — apenas
 * texto já extraído entra, candidatos de data saem. Nunca inventa data —
 * quando a evidência não é clara, o chamador decide marcar como pendente.
 *
 * Extraído de scripts/investigate-edition-dates-sample.ts (investigação da
 * amostra de 12 edições, 04-05/11/2026) para ser reaproveitado sem duplicar
 * lógica no processamento em lote das 497 edições.
 */

export const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MONTH_PATTERN = MONTHS.join("|");

export const WEEKDAYS_PT = [
  "domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado",
];

// "15 de março de 2018" / "15 de Março de 2018"
const FULL_DATE_RE = new RegExp(`(\\d{1,2})\\s+de\\s+(${MONTH_PATTERN})\\s+de\\s+(\\d{4})`, "gi");
// "15/03/2018" ou "15.03.2018"
const NUMERIC_DATE_RE = /\b(\d{2})[/.](\d{2})[/.](\d{4})\b/g;
// "quarta-feira (07)" — não tem mês/ano sozinho, serve só como pista fraca.
const WEEKDAY_PAREN_RE = /(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)-feira\s*\((\d{1,2})\)/gi;
// "Ano 10 - Nº 450" / "ANO X Nº NNN" — contexto de masthead, ajuda a confiar numa data próxima.
const MASTHEAD_RE = /ano\s+\d+.{0,30}?n[ºo°]\s*\.?\s*\d+/gi;
// Dateline fixo observado em TODAS as 12 amostras da investigação real
// (04/11/2026): "São João do Sul, {dia da semana}-feira, DD de MÊS de AAAA"
// — sempre logo antes de "Edição NNN". Muito mais específico/confiável que
// qualquer data completa solta no corpo da matéria.
const MASTHEAD_DATELINE_RE = new RegExp(
  `S[ãa]o\\s+Jo[ãa]o\\s+do\\s+Sul,\\s*(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)-feira,\\s*` +
    `(\\d{1,2})\\s+de\\s+(${MONTH_PATTERN})\\s+de\\s+(\\d{4})`,
  "gi",
);
// "Edição NNN" / "EDIÇÃO NNN" — para cruzar com o número esperado da chave R2.
const EDITION_LABEL_RE = /edi[çc][ãa]o\s*0*(\d+)/gi;

export type Confidence = "alta" | "media" | "baixa_ou_pendente";

export interface DateCandidate {
  rawMatch: string;
  normalized: string | null;
  weekdayExtracted: string | null;
  page: number;
  snippet: string;
  kind: "masthead_dateline" | "data_completa" | "data_numerica" | "dia_semana_parcial";
}

function monthIndex(name: string): number {
  return MONTHS.findIndex((m) => m.localeCompare(name, "pt-BR", { sensitivity: "base" }) === 0);
}

function snippetAround(text: string, index: number, length: number, radius = 60): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

export function findDateCandidates(text: string, page: number): DateCandidate[] {
  const candidates: DateCandidate[] = [];

  for (const match of text.matchAll(MASTHEAD_DATELINE_RE)) {
    const [raw, weekday, day, monthName, year] = match;
    const mIdx = monthIndex(monthName);
    const normalized = mIdx >= 0 ? `${year}-${String(mIdx + 1).padStart(2, "0")}-${day.padStart(2, "0")}` : null;
    candidates.push({
      rawMatch: raw,
      normalized,
      weekdayExtracted: weekday.toLowerCase(),
      page,
      snippet: snippetAround(text, match.index ?? 0, raw.length),
      kind: "masthead_dateline",
    });
  }

  for (const match of text.matchAll(FULL_DATE_RE)) {
    const [raw, day, monthName, year] = match;
    const mIdx = monthIndex(monthName);
    const normalized = mIdx >= 0 ? `${year}-${String(mIdx + 1).padStart(2, "0")}-${day.padStart(2, "0")}` : null;
    candidates.push({
      rawMatch: raw,
      normalized,
      weekdayExtracted: null,
      page,
      snippet: snippetAround(text, match.index ?? 0, raw.length),
      kind: "data_completa",
    });
  }

  for (const match of text.matchAll(NUMERIC_DATE_RE)) {
    const [raw, day, month, year] = match;
    const dayNum = Number(day);
    const monthNum = Number(month);
    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) continue;
    candidates.push({
      rawMatch: raw,
      normalized: `${year}-${month}-${day}`,
      weekdayExtracted: null,
      page,
      snippet: snippetAround(text, match.index ?? 0, raw.length),
      kind: "data_numerica",
    });
  }

  for (const match of text.matchAll(WEEKDAY_PAREN_RE)) {
    const [raw, weekday] = match;
    candidates.push({
      rawMatch: raw,
      normalized: null,
      weekdayExtracted: weekday.toLowerCase(),
      page,
      snippet: snippetAround(text, match.index ?? 0, raw.length),
      kind: "dia_semana_parcial",
    });
  }

  return candidates;
}

export function pickBestCandidate(
  candidates: DateCandidate[],
  fullText: string,
): { best: DateCandidate | null; confidence: Confidence } {
  const dateline = candidates.filter((c) => c.kind === "masthead_dateline" && c.normalized);
  if (dateline.length >= 1) {
    const distinct = new Set(dateline.map((c) => c.normalized));
    if (distinct.size === 1) return { best: dateline[0], confidence: "alta" };
    return { best: dateline[0], confidence: "media" };
  }

  const complete = candidates.filter((c) => c.kind === "data_completa" && c.normalized);
  const numeric = candidates.filter((c) => c.kind === "data_numerica" && c.normalized);
  const hasMasthead = MASTHEAD_RE.test(fullText);
  MASTHEAD_RE.lastIndex = 0;

  if (complete.length === 1) return { best: complete[0], confidence: "alta" };
  if (complete.length > 1) {
    const distinct = new Set(complete.map((c) => c.normalized));
    if (distinct.size === 1) return { best: complete[0], confidence: "alta" };
    return { best: complete[0], confidence: "media" };
  }
  if (numeric.length === 1) return { best: numeric[0], confidence: hasMasthead ? "media" : "baixa_ou_pendente" };
  if (numeric.length > 1) return { best: numeric[0], confidence: "baixa_ou_pendente" };
  if (candidates.length > 0) return { best: candidates[0], confidence: "baixa_ou_pendente" };
  return { best: null, confidence: "baixa_ou_pendente" };
}

/** Compara o dia da semana extraído do texto com o dia da semana real da data normalizada (UTC, evita fuso). */
export function weekdayMatches(normalizedDate: string, weekdayExtracted: string | null): boolean | null {
  if (!weekdayExtracted) return null;
  const idx = WEEKDAYS_PT.findIndex((w) => weekdayExtracted.toLowerCase().startsWith(w));
  if (idx < 0) return null;
  const [y, m, d] = normalizedDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  const real = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return real === idx;
}

/** Extrai os números de edição citados perto de "Edição NNN"/"EDIÇÃO NNN" no texto, para cruzar com a chave R2. */
export function extractEditionLabels(text: string): number[] {
  const numbers: number[] = [];
  for (const match of text.matchAll(EDITION_LABEL_RE)) {
    const n = Number(match[1]);
    if (Number.isInteger(n) && n > 0) numbers.push(n);
  }
  return numbers;
}
