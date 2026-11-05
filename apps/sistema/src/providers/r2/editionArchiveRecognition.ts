/**
 * Decisão pura (sem I/O) sobre reaproveitar ou não um PDF já existente no
 * acervo R2 (`acervo/edicoes/IR NNN.pdf`) para uma edição do painel.
 *
 * Nunca presume que ETag ou tamanho sozinhos provam identidade — a única
 * comparação que decide "é o mesmo arquivo" é o SHA-256 completo. Quando o
 * hash não está disponível ainda (edição nunca teve nada vinculado), não há
 * conflito possível: segue para vincular.
 */
export type EditionArchiveDecision =
  | "no_current_archive"
  | "same_object_already_linked"
  | "same_content_different_key"
  | "conflict_requires_decision";

export interface EditionArchiveDecisionInput {
  currentPdfR2Key: string | null;
  currentPdfSha256: string | null;
  candidateKey: string | null;
  candidateSha256: string | null;
}

export function decideEditionArchiveAction(input: EditionArchiveDecisionInput): EditionArchiveDecision {
  const { currentPdfR2Key, currentPdfSha256, candidateKey, candidateSha256 } = input;
  if (!currentPdfR2Key) return "no_current_archive";
  if (candidateKey && currentPdfR2Key === candidateKey) return "same_object_already_linked";
  if (
    currentPdfSha256 &&
    candidateSha256 &&
    currentPdfSha256.toLowerCase() === candidateSha256.toLowerCase()
  ) {
    return "same_content_different_key";
  }
  return "conflict_requires_decision";
}

export interface EditionArchiveObjectLike {
  key: string;
}

/**
 * Localiza, numa listagem já obtida do bucket (somente leitura), o objeto
 * do acervo histórico que corresponde ao número desta edição — nunca lista
 * o bucket sozinho (quem chama decide a política de paginação/prefixo).
 */
export function findAcervoObjectForEdition<T extends EditionArchiveObjectLike>(
  objects: readonly T[],
  editionNumber: number,
  parseKey: (key: string) => number | null,
): T | null {
  return objects.find((object) => parseKey(object.key) === editionNumber) ?? null;
}
