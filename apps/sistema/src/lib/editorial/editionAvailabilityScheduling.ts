/**
 * Agendamento de disponibilização do Jornal Online (fluxo unificado,
 * 06/11/2026) — fuso America/Sao_Paulo. O Brasil aboliu o horário de verão
 * em 2019: America/Sao_Paulo é UTC-3 o ano inteiro, sem exceção sazonal —
 * por isso um deslocamento fixo é suficiente aqui, sem precisar de uma
 * biblioteca de fuso horário.
 */
const SAO_PAULO_UTC_OFFSET_HOURS = 3;

/** Dia seguinte a `from` (padrão: agora) às 07:00 America/Sao_Paulo, como ISO UTC. */
export function nextDayAt7AmSaoPauloIso(from: Date = new Date()): string {
  const saoPauloLocalMs = from.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const saoPauloLocal = new Date(saoPauloLocalMs);
  const nextDay7AmUtcMs = Date.UTC(
    saoPauloLocal.getUTCFullYear(),
    saoPauloLocal.getUTCMonth(),
    saoPauloLocal.getUTCDate() + 1,
    7 + SAO_PAULO_UTC_OFFSET_HOURS,
    0,
    0,
    0,
  );
  return new Date(nextDay7AmUtcMs).toISOString();
}

/** `datetime-local` (sem fuso, ex.: "2026-11-07T07:00") interpretado como
 * America/Sao_Paulo e convertido para ISO UTC — usado quando o operador
 * altera manualmente a data/hora de disponibilização. */
export function saoPauloLocalInputToUtcIso(localDateTimeValue: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localDateTimeValue);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const utcMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) + SAO_PAULO_UTC_OFFSET_HOURS,
    Number(minute),
    0,
    0,
  );
  return new Date(utcMs).toISOString();
}

/** Inverso de `saoPauloLocalInputToUtcIso` — ISO UTC para o valor que um
 * input `datetime-local` espera, já convertido para o horário local de
 * America/Sao_Paulo (para preencher o campo de edição com o valor atual). */
export function utcIsoToSaoPauloLocalInput(isoUtc: string): string {
  const date = new Date(isoUtc);
  const saoPauloMs = date.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const saoPaulo = new Date(saoPauloMs);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return (
    `${saoPaulo.getUTCFullYear()}-${pad(saoPaulo.getUTCMonth() + 1)}-${pad(saoPaulo.getUTCDate())}` +
    `T${pad(saoPaulo.getUTCHours())}:${pad(saoPaulo.getUTCMinutes())}`
  );
}
