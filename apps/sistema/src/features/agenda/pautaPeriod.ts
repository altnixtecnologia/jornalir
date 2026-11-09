/** Semana editorial do Jornal IR: quinta-feira até quarta-feira. */
function parseUTC(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}
function ymdUTC(value: Date): string {
  return value.toISOString().slice(0, 10);
}
export function startOfPautaWeek(value: string): string {
  const date = parseUTC(value);
  // JS: 0=domingo, 4=quinta. Quarta deve apontar para a quinta anterior.
  const daysSinceThursday = (date.getUTCDay() + 3) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceThursday);
  return ymdUTC(date);
}
export function pautaWeekEnd(anchor: string): string {
  const date = parseUTC(anchor);
  date.setUTCDate(date.getUTCDate() + 6);
  return ymdUTC(date);
}
export function dateInPautaPeriod(day: string, start: string, end: string): boolean {
  return day >= start && day <= end;
}
