// Proteção mínima indispensável contra reimportar como "legado" uma
// matéria que já existe no banco com origin='manual' (28/10/2026) —
// cadastrada manualmente para cobrir o período entre a última importação
// do legado e a publicação real no site antigo, que pode ter saído
// depois cobrindo o MESMO acontecimento.
//
// Nunca descarta nada por si só: só sinaliza uma correspondência forte
// (três sinais concordando — título normalizado, data próxima E conteúdo
// com palavras distintivas em comum) para o chamador decidir o que fazer
// (tipicamente: tirar de "eligible" e mandar para revisão humana, nunca
// rejeitar). Assuntos parecidos com números/nomes diferentes (outro jogo,
// outra reunião) nunca batem no sinal de conteúdo, mesmo com título e data
// coincidindo por acaso — critério pensado para evitar falso-positivo
// descartando um acontecimento real diferente.
import { normalizeTitle } from "./integrity.mjs";

const HTML_TAG = /<[^>]+>/g;
const NON_WORD = /[^a-z0-9À-ÿ]+/g;
// 4 dias, não 1: a data da matéria manual é quando a pessoa CADASTROU
// (podendo ficar alguns dias depois do acontecimento real), enquanto a
// data do legado é a publicação original — caso real encontrado no
// preflight de 28/10/2026 (mesmo título exato, mesmo conteúdo, gap de 2
// dias). Continua limitado (nunca ilimitado) porque só entra em jogo
// quando título normalizado E conteúdo também concordam.
const MAX_DATE_DISTANCE_DAYS = 4;
const MIN_SIGNIFICANT_WORDS = 6;
const CONTENT_OVERLAP_THRESHOLD = 0.5;

function stripHtml(html) {
  return (html || "").replace(HTML_TAG, " ").replace(/\s+/g, " ").trim();
}

function normalizeBody(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Palavras "significativas" = razoavelmente longas (tende a capturar nomes
// próprios, lugares, números por extenso) — nunca conectivos/artigos
// comuns, que apareceriam em qualquer matéria sobre qualquer assunto.
function significantWords(normalizedText) {
  return new Set(
    normalizedText
      .split(NON_WORD)
      .filter((w) => w.length >= 5),
  );
}

function daysBetween(isoA, isoB) {
  const a = new Date(`${isoA}T00:00:00Z`).getTime();
  const b = new Date(`${isoB}T00:00:00Z`).getTime();
  return Math.abs(a - b) / 86400000;
}

/** Carrega todas as matérias origin='manual' já cadastradas, com título e
 * corpo pré-normalizados para comparação repetida (uma consulta só, nunca
 * uma por candidata). */
export async function loadManualArticles(sb) {
  const { data, error } = await sb
    .from("articles")
    .select("id, slug, title, published_at, body")
    .eq("origin", "manual");
  if (error) throw error;

  return (data ?? []).map((row) => {
    const bodyText = normalizeBody(stripHtml(row.body));
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      dateIso: (row.published_at || "").slice(0, 10),
      normalizedTitle: normalizeTitle(row.title),
      significantWords: significantWords(bodyText),
    };
  });
}

/**
 * Verifica UMA candidata do site legado contra as matérias manuais já
 * carregadas. Retorna null (nenhuma correspondência relevante) ou um
 * relatório de sinais — o chamador decide o que fazer; esta função nunca
 * aprova nem rejeita sozinha.
 */
export function findManualDuplicateMatch({ title, dateIso, bodyText }, manualArticles) {
  if (!manualArticles?.length || !dateIso) return null;
  const candidateNormalizedTitle = normalizeTitle(title);
  const candidateWords = significantWords(normalizeBody(bodyText || ""));

  for (const manual of manualArticles) {
    if (!manual.dateIso) continue;
    const dateClose = daysBetween(dateIso, manual.dateIso) <= MAX_DATE_DISTANCE_DAYS;
    if (!dateClose) continue;

    const a = candidateNormalizedTitle;
    const b = manual.normalizedTitle;
    const titleMatches = Boolean(a && b) && (a === b || a.includes(b) || b.includes(a));
    if (!titleMatches) continue;

    // Título + data batendo já é um sinal forte, mas ainda pode ser
    // coincidência (reedição de matéria antiga com o mesmo título
    // genérico). Conteúdo decide se é a MESMA matéria ou só uma
    // coincidência de título/data.
    let overlapRatio = 0;
    if (manual.significantWords.size >= MIN_SIGNIFICANT_WORDS && candidateWords.size > 0) {
      let shared = 0;
      for (const w of manual.significantWords) if (candidateWords.has(w)) shared += 1;
      overlapRatio = shared / manual.significantWords.size;
    }
    const contentMatches = overlapRatio >= CONTENT_OVERLAP_THRESHOLD;

    return {
      manualArticleId: manual.id,
      manualSlug: manual.slug,
      manualTitle: manual.title,
      signals: { titleMatches, dateClose, contentMatches, overlapRatio: Number(overlapRatio.toFixed(2)) },
      // Só confirma duplicata com os três sinais concordando; com só
      // título+data, fica "ambíguo" — nunca é tratado como o mesmo
      // acontecimento sem o conteúdo confirmar.
      confirmed: contentMatches,
    };
  }
  return null;
}

/**
 * Reaplica o guard sobre uma lista já classificada como "eligible" pela
 * barreira de integridade normal — tira as confirmadas como duplicata de
 * matéria manual (nunca entram no commit) e também as ambíguas (título+
 * data batendo, conteúdo não confirmando: fica pra revisão humana, nunca
 * é importada nem descartada às cegas). Usada igualmente pelo preflight
 * (report-sync-recent.mjs) e pelo commit real (sync-recent.mjs) — a
 * mesma função, nunca duas versões que podem divergir.
 */
export function partitionEligibleAgainstManual(eligibleList, manualArticles, detailCache, candidateKeyOf) {
  const finalEligible = [];
  const manualDuplicateList = [];
  const manualAmbiguousList = [];
  for (const entry of eligibleList) {
    const { candidate: c, detail } = entry;
    const key = candidateKeyOf(c);
    const bodyText = detailCache.get(key)?.bodyTextFull || detail?.bodyTextFull || detail?.bodyTextSample || "";
    const match = findManualDuplicateMatch(
      { title: detail?.title || c.primary.title, dateIso: c.publishedIso, bodyText },
      manualArticles,
    );
    if (!match) {
      finalEligible.push(entry);
    } else if (match.confirmed) {
      manualDuplicateList.push({ ...entry, manualMatch: match });
    } else {
      manualAmbiguousList.push({ ...entry, manualMatch: match });
    }
  }
  return { finalEligible, manualDuplicateList, manualAmbiguousList };
}
