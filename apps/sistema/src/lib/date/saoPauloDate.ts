/**
 * Datas civis do Financeiro do Jornal IR seguem America/Sao_Paulo,
 * independentemente do fuso do navegador, Vercel ou servidor.
 * Não modifica timestamps originais armazenados no Supabase.
 */
import { saoPauloCivilDate } from "@ir/types";

const saoPauloDateTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hourCycle: "h23",
});

function parts(formatter: Intl.DateTimeFormat, date: Date): Record<string, string> {
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

/** Extrai o dia civil de um timestamp, mesmo quando a data UTC já é o dia seguinte. */
export function saoPauloDayOfTimestamp(instant: string | Date): string {
  return saoPauloCivilDate(instant);
}

/** Mantém a API usada pelos módulos financeiros existentes. */
export function todayInSaoPauloISO(now: Date = new Date()): string {
  return saoPauloDayOfTimestamp(now);
}

function validatedUtcDay(ymd: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("Data civil inválida.");
  const ms = Date.parse(`${ymd}T00:00:00.000Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== ymd) {
    throw new Error("Data civil inexistente.");
  }
  return ms;
}

export function nextCalendarDayISO(ymd: string): string {
  return new Date(validatedUtcDay(ymd) + 86_400_000).toISOString().slice(0, 10);
}

function offsetAt(instant: number): number {
  const p = parts(saoPauloDateTime, new Date(instant));
  const localAsUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second),
  );
  return localAsUtc - instant;
}

/**
 * Primeira meia-noite do dia brasileiro, expressa em UTC.
 * Usa a regra real de fuso do Intl; não presume -03:00 fixo nem a TZ
 * configurada no servidor. Considera offsets próximos à virada para
 * comportar transições históricas de horário de verão.
 */
export function saoPauloDayStartUtcISO(ymd: string): string {
  const utcMidnight = validatedUtcDay(ymd);
  const candidates = [-12, 0, 12, 24]
    .map((hours) => offsetAt(utcMidnight + hours * 3_600_000))
    .map((offset) => utcMidnight - offset)
    .filter((instant) => saoPauloDayOfTimestamp(new Date(instant)) >= ymd);
  if (candidates.length === 0) throw new Error("Não foi possível calcular início do dia brasileiro.");
  return new Date(Math.min(...candidates)).toISOString();
}
