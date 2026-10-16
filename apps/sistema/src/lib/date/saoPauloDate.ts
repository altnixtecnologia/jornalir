/**
 * Dia civil em São Paulo. Evita preencher a data de um recebimento
 * como "amanhã" ao utilizar Date#toISOString() (UTC) à noite no Brasil.
 * Nunca usa fuso horário do servidor ou preferência do dispositivo.
 */
export function todayInSaoPauloISO(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
