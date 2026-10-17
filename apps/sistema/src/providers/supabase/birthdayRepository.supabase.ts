import type { SupabaseClient } from "@supabase/supabase-js";
import type { BirthdayEditionMessage, BirthdayEntry, BirthdayOrigin } from "@ir/types";
import type { BirthdayEntryChanges, BirthdayRepository, NewBirthdayEditionMessageRecord, NewBirthdayEntryRecord } from "@ir/core";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

/**
 * Adapter original para supabase/migrations/20261025100100_birthday_entries.sql
 * e 20261025100200_birthday_edition_messages.sql. DESATUALIZADO — a tela
 * real (`BirthdaysList.tsx`/`page.tsx`/`actions.ts`, em
 * `apps/sistema/src/app/sistema/aniversariantes/`) já persiste direto no
 * Supabase, sem passar por este provider. Nenhuma chamada real encontrada
 * a este arquivo — não assumir, só por ele existir, que a persistência
 * passa por aqui; conferir `actions.ts` primeiro.
 */

const ENTRIES_TABLE = "birthday_entries";
const ENTRIES_COLUMNS =
  "id, group_client_id, source_client_id, origin, display_name, birth_month, birth_day, birth_year, city, relationship, " +
  "profession, organization, known_as, message_context, notes, active, publish_in_print, created_at, updated_at";

const MESSAGES_TABLE = "birthday_edition_messages";
const MESSAGES_COLUMNS = "id, birthday_entry_id, edition_week_start, edition_week_end, message, family, opening, ending, created_at, updated_at";

interface BirthdayEntryRow {
  id: string;
  group_client_id: string | null;
  source_client_id: string | null;
  origin: BirthdayOrigin;
  display_name: string;
  birth_month: number;
  birth_day: number;
  birth_year: number | null;
  city: string | null;
  relationship: string | null;
  profession: string | null;
  organization: string | null;
  known_as: string | null;
  message_context: string | null;
  notes: string | null;
  active: boolean;
  publish_in_print: boolean;
  created_at: string;
  updated_at: string;
}

interface BirthdayEditionMessageRow {
  id: string;
  birthday_entry_id: string;
  edition_week_start: string;
  edition_week_end: string;
  message: string;
  family: string;
  opening: string;
  ending: string;
  created_at: string;
  updated_at: string;
}

function entryToDomain(row: BirthdayEntryRow): BirthdayEntry {
  return {
    id: row.id,
    groupClientId: row.group_client_id ?? undefined,
    sourceClientId: row.source_client_id ?? undefined,
    origin: row.origin,
    displayName: row.display_name,
    birthMonth: row.birth_month,
    birthDay: row.birth_day,
    birthYear: row.birth_year ?? undefined,
    city: row.city ?? undefined,
    relationship: row.relationship ?? undefined,
    profession: row.profession ?? undefined,
    organization: row.organization ?? undefined,
    knownAs: row.known_as ?? undefined,
    messageContext: row.message_context ?? undefined,
    notes: row.notes ?? undefined,
    active: row.active,
    publishInPrint: row.publish_in_print,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function entryToRow(record: NewBirthdayEntryRecord | BirthdayEntryChanges): Record<string, unknown> {
  return {
    group_client_id: record.groupClientId ?? null,
    source_client_id: record.sourceClientId ?? null,
    origin: record.origin ?? null,
    display_name: record.displayName ?? null,
    birth_month: record.birthMonth ?? null,
    birth_day: record.birthDay ?? null,
    birth_year: record.birthYear ?? null,
    city: record.city ?? null,
    relationship: record.relationship ?? null,
    profession: record.profession ?? null,
    organization: record.organization ?? null,
    known_as: record.knownAs ?? null,
    message_context: record.messageContext ?? null,
    notes: record.notes ?? null,
    active: record.active ?? true,
    publish_in_print: record.publishInPrint ?? true,
  };
}

function messageToDomain(row: BirthdayEditionMessageRow): BirthdayEditionMessage {
  return {
    id: row.id,
    birthdayEntryId: row.birthday_entry_id,
    editionWeekStart: row.edition_week_start,
    editionWeekEnd: row.edition_week_end,
    message: row.message,
    family: row.family,
    opening: row.opening,
    ending: row.ending,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createBirthdayRepositorySupabase(client: SupabaseClient): BirthdayRepository {
  return {
    async list() {
      if (isLocalPreviewEnabled()) return [];
      const { data, error } = await client.from(ENTRIES_TABLE).select(ENTRIES_COLUMNS).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => entryToDomain(row as unknown as BirthdayEntryRow));
    },

    async getById(id) {
      if (isLocalPreviewEnabled()) return null;
      const { data, error } = await client.from(ENTRIES_TABLE).select(ENTRIES_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? entryToDomain(data as unknown as BirthdayEntryRow) : null;
    },

    async create(record) {
      const { data, error } = await client.from(ENTRIES_TABLE).insert(entryToRow(record)).select(ENTRIES_COLUMNS).single();
      if (error) throw new Error(error.message);
      return entryToDomain(data as unknown as BirthdayEntryRow);
    },

    async update(id, changes) {
      const { data, error } = await client.from(ENTRIES_TABLE).update(entryToRow(changes)).eq("id", id).select(ENTRIES_COLUMNS).single();
      if (error) throw new Error(error.message);
      return entryToDomain(data as unknown as BirthdayEntryRow);
    },

    // Soft delete — nunca DELETE. "Excluir"/"Excluir grupo" na UI chama isto;
    // o cadastro mestre em public.clients nunca é afetado.
    async deactivate(id) {
      const { error } = await client.from(ENTRIES_TABLE).update({ active: false }).eq("id", id);
      if (error) throw new Error(error.message);
    },

    async getEditionMessage(birthdayEntryId, editionWeekStart) {
      if (isLocalPreviewEnabled()) return null;
      const { data, error } = await client
        .from(MESSAGES_TABLE)
        .select(MESSAGES_COLUMNS)
        .eq("birthday_entry_id", birthdayEntryId)
        .eq("edition_week_start", editionWeekStart)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? messageToDomain(data as unknown as BirthdayEditionMessageRow) : null;
    },

    // Upsert por (birthday_entry_id, edition_week_start) — mesma chave da
    // constraint única da migration; "Trocar mensagem" chama isto de novo
    // sobre a mesma edição em vez de inserir uma segunda linha.
    async saveEditionMessage(record: NewBirthdayEditionMessageRecord) {
      const { data, error } = await client
        .from(MESSAGES_TABLE)
        .upsert(
          {
            birthday_entry_id: record.birthdayEntryId,
            edition_week_start: record.editionWeekStart,
            edition_week_end: record.editionWeekEnd,
            message: record.message,
            family: record.family,
            opening: record.opening,
            ending: record.ending,
          },
          { onConflict: "birthday_entry_id,edition_week_start" },
        )
        .select(MESSAGES_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return messageToDomain(data as unknown as BirthdayEditionMessageRow);
    },
  };
}
