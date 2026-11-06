import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  markEditionUploadedAndSchedule,
  scheduleEditionAvailability,
} from "../src/providers/supabase/newspaperEditionRepository.supabase";

/**
 * Correção da auditoria (item 1, prioridade máxima, 06/11/2026): reaproveitar
 * ou anexar o PDF de uma edição histórica que JÁ está pública (ex.: uma das
 * ~497 edições antigas, ou a edição 776) nunca pode tirá-la do ar — nem
 * mesmo se o backfill da migration ainda não tiver sido aplicado no banco
 * remoto (defesa em profundidade: a lógica da aplicação olha `active` real,
 * nunca só `online_status`).
 *
 * Fake mínimo do client Supabase: só implementa a cadeia
 * `.from(table).select(cols).eq(col,val).maybeSingle()` e
 * `.from(table).update(patch).eq(col,val)`, exatamente o que
 * `markEditionUploadedAndSchedule`/`scheduleEditionAvailability` usam.
 */
function makeFakeEditionClient(initialRow: Record<string, unknown>): {
  client: SupabaseClient;
  getRow: () => Record<string, unknown>;
} {
  let row: Record<string, unknown> = { ...initialRow };
  const client = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: unknown) {
              return { async maybeSingle() { return { data: { ...row }, error: null }; } };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          row = { ...row, ...patch };
          return { eq: async (_col: string, _val: unknown) => ({ error: null }) };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, getRow: () => row };
}

test("markEditionUploadedAndSchedule NUNCA desativa uma edição histórica que já estava active=true, mesmo sem o backfill de online_status aplicado (simula a migration ainda não executada)", async () => {
  // Simula exatamente o estado problemático encontrado na auditoria: a
  // edição já é pública (active=true) mas online_status ainda está no
  // valor padrão da coluna nova, 'preparing' (migration de backfill ainda
  // não rodou no banco remoto).
  const { client, getRow } = makeFakeEditionClient({
    active: true,
    online_status: "preparing",
    available_at: null,
    scheduled_available_at: null,
  });

  await markEditionUploadedAndSchedule(client, "edition-776", {
    uploadedBy: "staff-1",
    defaultScheduledAvailableAtIso: "2026-11-07T10:00:00.000Z",
  });

  const row = getRow();
  assert.equal(row.active, true, "uma edição já pública nunca pode ser desativada ao reaproveitar/anexar o PDF");
  assert.equal(row.online_status, "available", "o estado deve ser corrigido para refletir a realidade, nunca 'scheduled'/'preparing'");
  assert.ok(row.available_at, "available_at deve ser preenchido quando ainda estava vazio");
});

test("markEditionUploadedAndSchedule agenda normalmente uma edição NOVA (nunca publicada antes)", async () => {
  const { client, getRow } = makeFakeEditionClient({
    active: false,
    online_status: "preparing",
    available_at: null,
    scheduled_available_at: null,
  });

  await markEditionUploadedAndSchedule(client, "edition-new", {
    uploadedBy: "staff-1",
    defaultScheduledAvailableAtIso: "2026-11-07T10:00:00.000Z",
  });

  const row = getRow();
  assert.equal(row.active, false, "uma edição nova só fica pública quando o cron chegar no horário agendado");
  assert.equal(row.online_status, "scheduled");
  assert.equal(row.scheduled_available_at, "2026-11-07T10:00:00.000Z");
});

test("scheduleEditionAvailability (alteração manual de data) NUNCA oculta uma edição já disponível", async () => {
  const { client, getRow } = makeFakeEditionClient({
    active: true,
    online_status: "preparing", // backfill ainda não aplicado — mesma defesa em profundidade
  });

  await scheduleEditionAvailability(client, "edition-776", "2026-11-08T10:00:00.000Z", "staff-2");

  const row = getRow();
  assert.notEqual(row.online_status, "scheduled", "uma edição já ativa nunca deve voltar para 'scheduled' só por uma troca de data");
});
