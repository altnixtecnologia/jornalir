/** Brazil-local editorial week (Thursday–Wednesday). Dates are ISO YYYY-MM-DD. */
export function brazilTodayISO(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values: Record<string, string> = {};
  for (const part of parts) values[part.type] = part.value;
  return `${values.year}-${values.month}-${values.day}`;
}
export function weekStartFromISO(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  const daysFromThursday = (d.getUTCDay() - 4 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - daysFromThursday);
  return d.toISOString().slice(0, 10);
}
export function currentBirthdayWeekISO(): string {
  return weekStartFromISO(brazilTodayISO());
}
export function editionDays(start: string): string[] {
  const d = new Date(start + "T12:00:00Z");
  return Array.from({ length: 7 }, (_, index) => {
    const next = new Date(d);
    next.setUTCDate(d.getUTCDate() + index);
    return next.toISOString().slice(0, 10);
  });
}
export function birthdayWithinEdition(birthDate: string, weekStart: string): boolean {
  return editionDays(weekStart).some(d => d.slice(5) === birthDate.slice(5));
}
export function validBirthDate(input: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const value = new Date(input + "T12:00:00Z");
  return !Number.isNaN(value.getTime()) && value.toISOString().slice(0, 10) === input
    && Number(input.slice(0, 4)) >= 1900 && Number(input.slice(0, 4)) <= 2100;
}
