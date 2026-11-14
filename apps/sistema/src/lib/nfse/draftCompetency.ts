/**
 * A competência sugerida deve respeitar o DIA LOCAL do operador.
 * `toISOString()` usa UTC e pode sugerir o dia seguinte às 21h em UTC-03,
 * ocasionando emissão com competência incorreta no celular.
 */
export function formatLocalCompetencyDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Aviso orientativo, nunca regra de bloqueio: a regra de notas retroativas
 * depende de município e adesão anterior ao emissor nacional.
 * Fonte: CGNFS-e, comunicado de 29/10/2026.
 */
export function needsPreNovemberSimplesCompetencyReview(input: {
  simplesNacionalOption?: string;
  competencyDate: string;
}): boolean {
  return input.simplesNacionalOption === "me_epp" &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.competencyDate) &&
    input.competencyDate < "2026-11-01";
}
