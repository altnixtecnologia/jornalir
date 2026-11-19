export function formatDateBR(iso: string): string {
  const date = new Date(iso);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear());
  return `${day}/${month}/${year}`;
}

/** Data e hora editorial para o leitor, no fuso do jornal (SC/RS). */
export function formatEditorialDateTimeBR(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("day")}/${value("month")}/${value("year")} às ${value("hour")}:${value("minute")}h`;
}

/** Só anuncia edições confirmadas depois da publicação original. */
export function isEditoriallyEdited(publishedAt: string, editedAt?: string): boolean {
  if (!editedAt) return false;
  const publishedMs = Date.parse(publishedAt);
  const editedMs = Date.parse(editedAt);
  return Number.isFinite(publishedMs) && Number.isFinite(editedMs) && editedMs > publishedMs;
}
