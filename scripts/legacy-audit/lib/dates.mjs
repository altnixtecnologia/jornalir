// Parsing de data/hora do legado — centralizado (Fase 35B) para nunca
// divergir entre o corte de lote, a barreira de integridade e a
// importação. O CMS legado sempre renderizou "dd/mm/aaaa HH:MM" nas 1.635
// amostras reais do lote 2015-2016 (verificado); mesmo assim, o parser
// aceita só a data (precision "date_only") caso uma página real não tenha
// hora — nunca inventa um horário.
const JOURNAL_UTC_OFFSET = "-03:00"; // America/Sao_Paulo, sem horário de verão atualmente.

export function parseBrDateTime(raw) {
  const m = (raw || "").match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, d, mo, y, hh, mm] = m;
  const dateIso = `${y}-${mo}-${d}`;
  if (dateIso === "1969-12-31" || dateIso === "1970-01-01") return { dateIso, isBug: true };
  if (hh && mm) {
    return { dateIso, time: `${hh}:${mm}`, precision: "datetime", isBug: false };
  }
  return { dateIso, time: null, precision: "date_only", isBug: false };
}

/**
 * published_at real para gravação — NUNCA um horário inventado (item 1).
 * Com hora real: preserva exatamente, no fuso do jornal (não UTC de
 * meio-dia, que mascarava a hora original). Só com data: meio-dia UTC do
 * MESMO dia é usado apenas como valor técnico não-ambíguo (não pode virar
 * o dia anterior/seguinte em nenhum fuso razoável) — a precisão real
 * (`date_only`) é sempre registrada à parte em `raw_metadata`, nunca
 * escondida atrás do timestamp.
 */
export function toPublishedAtIso(parsed) {
  if (parsed.precision === "datetime") {
    return `${parsed.dateIso}T${parsed.time}:00${JOURNAL_UTC_OFFSET}`;
  }
  return `${parsed.dateIso}T12:00:00Z`;
}
