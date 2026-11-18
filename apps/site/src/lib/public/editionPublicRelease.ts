/**
 * Disponibilidade pública do Jornal Online.
 *
 * "active" por si só não prova publicação: uma edição recém-cadastrada pode
 * estar ativa e em preparação, sem PDF e sem "available_at" (ex.: edição 778).
 * Já "online_status=attention" pode indicar erro posterior ao arquivamento
 * de uma edição que continua publicada. Por isso usamos a liberação efetiva,
 * com data/hora, e não somente o estado operacional.
 */
export function isEditionPubliclyReleased(
  edition: { active: boolean; available_at: string | null | undefined },
  nowMs: number = Date.now(),
): boolean {
  if (!edition.active || !edition.available_at) return false;
  const availableMs = Date.parse(edition.available_at);
  return Number.isFinite(availableMs) && availableMs <= nowMs;
}
