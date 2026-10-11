import type { BirthdayEditionMessage, BirthdayEntry } from "@ir/types";

/** Dados de um novo aniversariante; id, createdAt e updatedAt são atribuídos pelo provider. */
export type NewBirthdayEntryRecord = Omit<BirthdayEntry, "id" | "createdAt" | "updatedAt">;

export type BirthdayEntryChanges = Partial<NewBirthdayEntryRecord>;

export type NewBirthdayEditionMessageRecord = Omit<BirthdayEditionMessage, "id" | "createdAt" | "updatedAt">;

/**
 * Contrato preparado para a futura persistência real de Aniversariantes
 * (ver supabase/migrations/20261025100100_birthday_entries.sql e
 * 20261025100200_birthday_edition_messages.sql). NINGUÉM na UI chama isto
 * ainda — `BirthdaysList.tsx` continua 100% em memória (preview), de
 * propósito, para não depender do Supabase enquanto ele estiver bloqueado.
 * Mesmo padrão de `ClientRepository`.
 */
export interface BirthdayRepository {
  list(): Promise<BirthdayEntry[]>;
  getById(id: string): Promise<BirthdayEntry | null>;
  create(record: NewBirthdayEntryRecord): Promise<BirthdayEntry>;
  update(id: string, changes: BirthdayEntryChanges): Promise<BirthdayEntry>;
  /** "Excluir"/"Excluir grupo" no módulo é sempre soft delete (active = false) — nunca remove a linha nem o cadastro mestre associado. */
  deactivate(id: string): Promise<void>;

  /** Mensagem já atribuída a esta pessoa nesta edição, se houver — null quando ainda não foi gerada. */
  getEditionMessage(birthdayEntryId: string, editionWeekStart: string): Promise<BirthdayEditionMessage | null>;
  /** Cria ou sobrescreve (upsert por birthdayEntryId + editionWeekStart) — "Trocar mensagem" chama isto de novo sobre a mesma edição. */
  saveEditionMessage(record: NewBirthdayEditionMessageRecord): Promise<BirthdayEditionMessage>;
}
