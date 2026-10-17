/**
 * Aniversariantes — BASE EDITORIAL SEPARADA de `clients` (decisão
 * arquitetural confirmada pelo usuário). Nenhuma tabela real existe ainda
 * (ver relatório da tarefa) — estes tipos descrevem só o formato dos
 * dados de PREVIEW LOCAL usados para validar o layout/funcionamento.
 *
 * NUNCA usar CPF/CNPJ aqui — a base editorial não duplica dados
 * administrativos do cadastro mestre, só nome/nascimento/cidade para
 * publicação.
 */
export type BirthdayOrigin = "cadastro" | "familiar" | "manual";

export interface BirthdayEntry {
  id: string;
  /** Nome para publicação no jornal — pode divergir do nome do cadastro. */
  displayName: string;
  /** "YYYY-MM-DD" — o ano pode ser fictício/desconhecido para familiares. Para um registro de fundação (isFounding), é a data de fundação, nunca um nascimento. */
  birthDate: string;
  /** Data do cadastro do registro, independente da data de nascimento. */
  createdAt?: string;
  /** true = este registro representa o aniversário de FUNDAÇÃO de uma instituição (PJ), nunca um nascimento de pessoa. Controla só rótulos/textos da UI — nunca é combinado com relationship nem aparece em BirthdayGroup.principal (que continua exclusivo de pessoa física, "PJ nunca tem titular aniversariante"). */
  isFounding?: boolean;
  /** URL da foto de destaque opcional (photo_media_asset_id em birthday_entries) — ausente = sem destaque visual. */
  photoUrl?: string;
  city: string;
  /** Preenchido para membros de um grupo (ex.: "Cônjuge", "Filho(a)", "Responsável"); ausente para o titular PF. */
  relationship?: string;
  origin: BirthdayOrigin;
  active: boolean;
  publishInPrint: boolean;
  notes?: string;
  /**
   * Perfil editorial opcional — só para a mensagem de aniversário, nunca o
   * Cadastro mestre (`clients`). Texto livre, sem lista fechada: o usuário
   * escreve a forma editorial desejada (ex.: "Empresária"), e o gerador usa
   * essa palavra exatamente como está, sem tentar inferir gênero.
   */
  profession?: string;
  /** Empresa/entidade citada ocasionalmente na mensagem — não é o CNPJ do Cadastro mestre. */
  organization?: string;
  /** Apelido/como é conhecido — usado com moderação pelo gerador, nunca substitui `displayName`. */
  knownAs?: string;
  /**
   * Notas livres para ajudar a geração (ex.: "integrante da Associação
   * Comercial"). O gerador só usa isto quando reconhece um padrão seguro —
   * do contrário, ignora completamente; nunca despeja o texto bruto na mensagem.
   */
  messageContext?: string;
}

export interface BirthdayGroup {
  id: string;
  kind: "individual" | "company";
  /** Nome do grupo no cabeçalho da árvore — nome da pessoa (PF) ou razão social (PJ). */
  label: string;
  city?: string;
  /** Só existe quando kind === "individual" e o cadastro tem nascimento. PJ nunca tem titular aniversariante. */
  principal?: BirthdayEntry;
  /** Só existe quando kind === "company" e o cadastro tem founding_date — conceito SEPARADO de principal, nunca um titular aniversariante (ver BirthdayEntry.isFounding). */
  foundingEntry?: BirthdayEntry;
  /** Familiares (PF) ou pessoas relacionadas (PJ) — sempre origin "familiar" ou "manual". */
  members: BirthdayEntry[];
}

/** Semana editorial do jornal: quinta-feira → quarta-feira seguinte. */
export function getNewspaperWeekRange(reference: Date = new Date()): { start: Date; end: Date } {
  const day = reference.getDay(); // 0=domingo ... 4=quinta
  const diffSinceThursday = (day - 4 + 7) % 7;
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  start.setDate(reference.getDate() - diffSinceThursday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function getCalendarWeekRange(reference: Date = new Date()): { start: Date; end: Date } {
  const day = reference.getDay();
  const diffSinceMonday = (day + 6) % 7;
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  start.setDate(reference.getDate() - diffSinceMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function getMonthRange(reference: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

/** Compara só mês/dia (aniversário é recorrente — o ano de `birthDateIso` não importa para o filtro de período). */
export function isBirthdayWithinRange(birthDateIso: string, start: Date, end: Date): boolean {
  const parts = birthDateIso.split("-").map(Number);
  const month = parts[1];
  const day = parts[2];
  if (!month || !day) return false;
  const target = month * 100 + day;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  // Varredura dia a dia — sempre ≤31 dias nos filtros desta tela, custo desprezível.
  for (let i = 0; i < 400 && cursor <= last; i += 1) {
    const candidate = (cursor.getMonth() + 1) * 100 + cursor.getDate();
    if (candidate === target) return true;
    cursor.setDate(cursor.getDate() + 1);
  }
  return false;
}

/** Posição (0..N) de `birthDateIso` dentro de [start,end] — null se não cair no período. Usada pra ordenar por dia dentro do intervalo (quinta primeiro, quarta por último, etc.), não por mês/dia cru. */
export function dayIndexWithinRange(birthDateIso: string, start: Date, end: Date): number | null {
  const parts = birthDateIso.split("-").map(Number);
  const month = parts[1];
  const day = parts[2];
  if (!month || !day) return null;
  const target = month * 100 + day;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  let index = 0;
  for (let i = 0; i < 400 && cursor <= last; i += 1) {
    const candidate = (cursor.getMonth() + 1) * 100 + cursor.getDate();
    if (candidate === target) return index;
    cursor.setDate(cursor.getDate() + 1);
    index += 1;
  }
  return null;
}

export function formatBirthDateShort(birthDateIso: string): string {
  const parts = birthDateIso.split("-");
  if (parts.length < 3) return birthDateIso;
  return `${parts[2]}/${parts[1]}`;
}

const WEEKDAY_ABBR = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const WEEKDAY_FULL = [
  "DOMINGO",
  "SEGUNDA-FEIRA",
  "TERÇA-FEIRA",
  "QUARTA-FEIRA",
  "QUINTA-FEIRA",
  "SEXTA-FEIRA",
  "SÁBADO",
];

export function weekdayAbbr(date: Date): string {
  return WEEKDAY_ABBR[date.getDay()];
}

export function weekdayFull(date: Date): string {
  return WEEKDAY_FULL[date.getDay()];
}

export function formatDateShort(date: Date): string {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function formatDateLong(date: Date): string {
  return date.toLocaleDateString("pt-BR");
}

/** Lista os 7 dias (quinta→quarta) de uma semana editorial, para a faixa semanal. */
export function listNewspaperWeekDays(range: { start: Date; end: Date }): Date[] {
  const days: Date[] = [];
  const cursor = new Date(range.start);
  for (let i = 0; i < 7; i += 1) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Desloca a referência em N semanas (navegação ‹ anterior / próxima ›) sem sair do alinhamento quinta→quarta. */
export function shiftWeeks(reference: Date, weeks: number): Date {
  const next = new Date(reference);
  next.setDate(next.getDate() + weeks * 7);
  return next;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Mês/dia de `birthDateIso` projetado dentro do ano de `withinDate` — usado para comparar com um dia específico da faixa semanal. */
export function matchesDay(birthDateIso: string, day: Date): boolean {
  const parts = birthDateIso.split("-").map(Number);
  return parts[1] === day.getMonth() + 1 && parts[2] === day.getDate();
}
