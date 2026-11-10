/** Edição 777 pertence à Pauta de quinta (05/11) a quarta (11/11) de 2026.
 * Exceções são mantidas em pauta_edition_overrides, nunca na publicação do jornal. */
export const PAUTA_EDITION_ANCHOR_WEEK = "2026-11-05";
export const PAUTA_EDITION_ANCHOR_NUMBER = 777;

export function automaticPautaEditionNumber(weekStart: string): number {
  const anchor = Date.parse(PAUTA_EDITION_ANCHOR_WEEK + "T12:00:00Z");
  const target = Date.parse(weekStart + "T12:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !Number.isFinite(target)) {
    throw new Error("Semana editorial inválida");
  }
  const diff = Math.round((target - anchor) / (7 * 86400000));
  const edition = PAUTA_EDITION_ANCHOR_NUMBER + diff;
  if (edition < 1) throw new Error("Edição calculada inválida");
  return edition;
}
