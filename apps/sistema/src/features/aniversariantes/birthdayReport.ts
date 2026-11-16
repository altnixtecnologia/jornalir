import type { BirthdayEntry } from "./birthdayTypes";
import { formatBirthDateShort } from "./birthdayTypes";

/**
 * Acordo editorial confirmado em 17/10/2026:
 * três colunas separadas por TAB, uma linha por aniversariante,
 * sem cabeçalho, título, divisões por dia nem mensagens. A seleção,
 * autorização e ordenação cronológica são realizadas antes desta etapa.
 */
export function birthdayReportToTSV(rows: readonly Pick<BirthdayEntry,"birthDate"|"displayName"|"city">[]): string {
  return rows.map((entry) =>
    `${formatBirthDateShort(entry.birthDate)}\t${entry.displayName}\t${entry.city || ""}`,
  ).join("\n");
}
