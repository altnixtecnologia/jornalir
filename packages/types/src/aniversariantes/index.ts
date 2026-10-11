// Aniversariantes — base editorial SEPARADA de Clientes (ver
// supabase/migrations/20261025100100_birthday_entries.sql). Estes tipos
// descrevem o modelo preparado para a futura persistência real; o módulo
// de UI (apps/sistema/src/features/aniversariantes) ainda usa seus
// próprios tipos de preview em memória — não foram unificados aqui de
// propósito, para não obrigar o preview a depender do Supabase enquanto
// ele estiver bloqueado.

export type BirthdayOrigin = "cadastro" | "familiar" | "manual";

export interface BirthdayEntry {
  id: string;
  /** Cadastro PF/PJ agrupador da árvore (titular ou empresa). Ausente em registros manuais independentes. */
  groupClientId?: string;
  /** Preenchido quando o próprio aniversariante também é um cadastro em Clientes. */
  sourceClientId?: string;
  origin: BirthdayOrigin;

  /** Nome para publicação — snapshot, pode divergir do cadastro. */
  displayName: string;
  /**
   * Dia/mês/ano de nascimento — NUNCA uma `Date`/string de data completa.
   * Aniversário é recorrente anualmente e o ano de nascimento real
   * frequentemente não é conhecido (especialmente para familiares); o
   * sistema nunca inventa um ano só para montar uma data. `birthMonth`/
   * `birthDay` são sempre obrigatórios, `birthYear` é opcional. Projetar o
   * aniversário para o ano de uma edição específica (Semana do Jornal),
   * inclusive em semanas que atravessam virada de ano (ex.: 29/12->04/01),
   * é sempre calculado a partir de (birthMonth, birthDay) pela aplicação.
   */
  birthMonth: number;
  birthDay: number;
  birthYear?: number;
  city?: string;
  relationship?: string;
  profession?: string;
  organization?: string;
  knownAs?: string;
  messageContext?: string;
  notes?: string;

  /** false = removido da base editorial (soft delete) — nunca afeta o cadastro mestre. */
  active: boolean;
  publishInPrint: boolean;

  createdAt: string;
  updatedAt: string;
}

/** Mensagem editorial de uma edição (Semana do Jornal, quinta->quarta) — pertence à edição, não ao aniversariante. */
export interface BirthdayEditionMessage {
  id: string;
  birthdayEntryId: string;
  /** "YYYY-MM-DD" — quinta-feira que inicia a edição. */
  editionWeekStart: string;
  /** "YYYY-MM-DD" — quarta-feira seguinte. */
  editionWeekEnd: string;
  message: string;
  /** Família estrutural do template usado — só para o gerador priorizar variedade; nunca exibida ao usuário. */
  family: string;
  opening: string;
  ending: string;
  createdAt: string;
  updatedAt: string;
}
