import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { archiveNfseDocuments, archivePendingNfseNotes, type ArchiveDeps } from "../src/lib/nfse/archiveNfseDocuments";
import { runNfseDeliveryBatch, isNfseArchiveEnabled, type DeliveryWorkerDeps } from "../src/lib/nfse/deliveryWorker";
import { EmailOutcomeUncertainError, EmailRejectedByProviderError } from "../src/lib/nfse/resendDelivery";
import { fiscalRecipient, canManuallyResend } from "../src/lib/nfse/deliveryPolicy";
import { STAFF_MODULE_ACTIONS } from "../src/lib/permissions/staffPermissionsCatalog";

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

// ---------------------------------------------------------------------------------------------------------
// Banco falso em memória (somente o encadeamento usado por arquivamento e worker; nenhum acesso real).
type Row = Record<string, any>;
interface Db { tables: Record<string, Row[]>; unique: Record<string, string[]>; beforeInsert?: (t: string, row: Row) => void; seq: number }
function fakeDb(tables: Record<string, Row[]>, unique: Record<string, string[]> = {}) {
  const db: Db = { tables, unique, seq: 0 };
  const client = {
    from(t: string) {
      const rows = (db.tables[t] ??= []);
      let op: "select" | "update" | "insert" = "select"; let patch: Row = {}; let ins: Row = {}; let max = Infinity;
      const f: Array<(r: Row) => boolean> = []; let order: [string, boolean] | null = null;
      const match = () => { let m = rows.filter((r) => f.every((p) => p(r))); if (order) m = [...m].sort((a, b) => (a[order![0]] < b[order![0]] ? -1 : 1) * (order![1] ? 1 : -1)); return m.slice(0, max); };
      const q: any = {
        update(p: Row) { op = "update"; patch = p; return q; },
        insert(r: Row) { op = "insert"; ins = r; return q; },
        select(_c?: string) { return q; },
        eq(c: string, v: any) { f.push((r) => r[c] === v); return q; },
        in(c: string, v: any[]) { f.push((r) => v.includes(r[c])); return q; },
        not(c: string, o: string, v: any) { assert.equal(o, "is"); f.push((r) => (r[c] ?? null) !== v); return q; },
        order(c: string, o: { ascending: boolean }) { order = [c, o.ascending]; return q; },
        limit(n: number) { max = n; return q; },
        run(single: "none" | "maybe" | "one") {
          let data: any; let error: any = null;
          if (op === "insert") {
            db.beforeInsert?.(t, ins);
            const keys = db.unique[t];
            if (keys && rows.some((r) => keys.every((k) => r[k] === ins[k]))) { data = null; error = { message: "duplicate key value violates unique constraint" }; }
            else { const row = { id: `${t}-${++db.seq}`, ...ins }; rows.push(row); data = row; }
          } else if (op === "update") { const m = match(); m.forEach((r) => Object.assign(r, patch)); data = m; }
          else data = match();
          if (single === "none") return { data, error };
          if (error) return { data: null, error };
          const list = Array.isArray(data) ? data : [data];
          if (single === "one" && list.length !== 1) return { data: null, error: { message: "esperava 1 linha" } };
          return { data: list[0] ?? null, error: null };
        },
        maybeSingle() { return Promise.resolve(q.run("maybe")); },
        single() { return Promise.resolve(q.run("one")); },
        then(res: (v: unknown) => void) { res(q.run("none")); },
      };
      return q;
    },
  };
  return { db, admin: client as unknown as SupabaseClient };
}

// ---------------------------------------------------------------------------------------------------------
// R2 e gerador de PDF simulados.
function mockArchiveDeps(opts: { failSave?: boolean; corruptRead?: boolean } = {}) {
  const store = new Map<string, Buffer>(); const saves: string[] = []; const reads: string[] = [];
  const deps: ArchiveDeps = {
    async save({ noteId, environment, kind, data }) {
      if (opts.failSave) throw new Error("R2 indisponível");
      const s = sha(data); const key = `nfse/${environment}/${noteId}/${kind}-${s}.${kind === "danfse_pdf" ? "pdf" : "xml"}`;
      store.set(key, data); saves.push(kind);
      return { key, sha256: s, sizeBytes: data.length, contentType: kind === "danfse_pdf" ? "application/pdf" : "application/xml" };
    },
    async read(key, expected) {
      reads.push(key); const b = store.get(key);
      if (!b || opts.corruptRead || sha(b) !== expected) throw new Error("Integridade SHA-256 do arquivo fiscal não confirmada");
      return b;
    },
    async buildPdf() { return Buffer.from("%PDF-1.4 fictício\n%%EOF\n", "latin1"); },
  };
  return { deps, store, saves, reads };
}
const note = (id = "n1", over: Row = {}): any => ({ id, environment: "production", accessKey: "CHAVE", nfseXml: `<NFSe id="${id}"/>`, signedDpsXml: `<DPS id="${id}"/>`, nfseNumber: "100", dpsId: "DPS1", ...over });
const assetsOf = (db: Db, id: string) => (db.tables.nfse_document_assets ?? []).filter((a) => a.issued_note_id === id);
const UNIQ = { nfse_document_assets: ["issued_note_id", "kind"] };

// ===================================================== ARQUIVAMENTO NO R2 (mocks) =====================================================
test("arquiva XML da NFS-e, DPS e DANFSe no R2 com SHA-256 e é idempotente (2ª execução não grava de novo)", async () => {
  const { db, admin } = fakeDb({}, UNIQ); const r2 = mockArchiveDeps();
  const first = await archiveNfseDocuments(admin, note(), r2.deps);
  assert.deepEqual(r2.saves.sort(), ["danfse_pdf", "dps_xml", "nfse_xml"]);
  assert.equal(assetsOf(db, "n1").length, 3);
  assert.equal(first.nfse_xml.sha256, sha(Buffer.from('<NFSe id="n1"/>')));
  const second = await archiveNfseDocuments(admin, note(), r2.deps);
  assert.equal(r2.saves.length, 3, "nada novo gravado");
  assert.equal(r2.reads.length, 3, "integridade conferida no R2, não confiada nos metadados");
  assert.equal(assetsOf(db, "n1").length, 3); assert.equal(second.danfse_pdf.id, first.danfse_pdf.id);
});
test("corrida entre dois workers: o segundo INSERT falha por duplicidade e reaproveita a linha idêntica", async () => {
  const { db, admin } = fakeDb({}, UNIQ); const r2 = mockArchiveDeps();
  const both = await Promise.all([archiveNfseDocuments(admin, note(), r2.deps), archiveNfseDocuments(admin, note(), r2.deps)]);
  assert.equal(assetsOf(db, "n1").length, 3, "nunca duplica");
  assert.equal(both[0].nfse_xml.sha256, both[1].nfse_xml.sha256);
});
test("integridade: arquivo do R2 divergente do SHA registrado => erro (nunca usa metadados falsos)", async () => {
  const { admin } = fakeDb({}, UNIQ); const ok = mockArchiveDeps();
  await archiveNfseDocuments(admin, note(), ok.deps);
  const bad = mockArchiveDeps({ corruptRead: true }); bad.store.clear();
  await assert.rejects(archiveNfseDocuments(admin, note(), bad.deps), /Integridade SHA-256/);
});
test("sem XML oficial/DPS assinada: não arquiva nem grava nada", async () => {
  const { db, admin } = fakeDb({}, UNIQ); const r2 = mockArchiveDeps();
  for (const over of [{ nfseXml: null }, { signedDpsXml: "" }, { accessKey: null }]) await assert.rejects(archiveNfseDocuments(admin, note("n1", over), r2.deps), /XML oficial/);
  assert.equal(r2.saves.length, 0); assert.equal(assetsOf(db, "n1").length, 0);
});
test("R2 fora do ar: erro, nenhuma linha de documento inventada e a nota não é tocada", async () => {
  const { db, admin } = fakeDb({ nfse_issued_notes: [{ id: "n1", status: "authorized" }] }, UNIQ);
  await assert.rejects(archiveNfseDocuments(admin, note(), mockArchiveDeps({ failSave: true }).deps), /R2 indisponível/);
  assert.equal(assetsOf(db, "n1").length, 0);
  assert.deepEqual(db.tables.nfse_issued_notes, [{ id: "n1", status: "authorized" }]);
});

// ============================ ARQUIVAMENTO AUTOMÁTICO DAS NOTAS AUTORIZADAS (independe do e-mail) ============================
function notesDb(complete: string[], partial: string[], missing: string[]) {
  const notes: Row[] = [...complete, ...partial, ...missing].map((id, i) => ({ id, environment: "production", access_key: "K", nfse_xml: "<x/>", created_at: `2026-11-1${i}` }));
  notes.push({ id: "homolog", environment: "homologation", access_key: "K", nfse_xml: "<x/>", created_at: "2026-11-30" });
  notes.push({ id: "sem-xml", environment: "production", access_key: null, nfse_xml: null, created_at: "2026-11-29" });
  return fakeDb({ nfse_issued_notes: notes, nfse_document_assets: [] }, UNIQ);
}
async function seed(admin: SupabaseClient, r2: ReturnType<typeof mockArchiveDeps>, ids: string[], onlyXml = false) {
  for (const id of ids) {
    if (onlyXml) { const u = await r2.deps.save({ noteId: id, environment: "production", kind: "nfse_xml", data: Buffer.from(`<NFSe id="${id}"/>`) });
      await (admin as any).from("nfse_document_assets").insert({ issued_note_id: id, kind: "nfse_xml", r2_key: u.key, sha256: u.sha256, size_bytes: u.sizeBytes, content_type: u.contentType }).select("id").single(); }
    else await archiveNfseDocuments(admin, note(id), r2.deps);
  }
}
test("lote de arquivamento: só notas de produção autorizadas sem os 3 documentos; completas, homologação e sem XML ficam intactas", async () => {
  const { db, admin } = notesDb(["ok"], ["parcial"], ["falta"]); const r2 = mockArchiveDeps();
  await seed(admin, r2, ["ok"]); await seed(admin, r2, ["parcial"], true); const base = r2.saves.length;
  const loaded: string[] = [];
  const out = await archivePendingNfseNotes(admin, { deps: r2.deps, loadNote: async (id) => { loaded.push(id); return note(id); } });
  assert.deepEqual(out, { archived: 2, failed: 0, pending: 0 });
  assert.deepEqual(loaded.sort(), ["falta", "parcial"]);
  assert.equal(r2.saves.length - base, 3 + 2, "falta=3 documentos; parcial só dps+pdf (xml já existia e foi conferido)");
  for (const id of ["ok", "parcial", "falta"]) assert.equal(assetsOf(db, id).length, 3, id);
  assert.equal(assetsOf(db, "homolog").length + assetsOf(db, "sem-xml").length, 0);
  const again = await archivePendingNfseNotes(admin, { deps: r2.deps, loadNote: async (id) => note(id) });
  assert.deepEqual(again, { archived: 0, failed: 0, pending: 0 }, "idempotente");
});
test("lote de arquivamento: respeita o limite por execução e a falha de uma nota não interrompe as outras", async () => {
  const { admin } = notesDb([], [], ["a", "b", "c", "d"]); const r2 = mockArchiveDeps();
  const lim = await archivePendingNfseNotes(admin, { limit: 1, deps: r2.deps, loadNote: async (id) => note(id) });
  assert.equal(lim.archived, 1); assert.equal(lim.pending, 3);
  const mixed = await archivePendingNfseNotes(admin, { limit: 3, deps: r2.deps, loadNote: async (id) => { if (id === "c") throw new Error("falha local"); return note(id); } });
  assert.equal(mixed.failed + mixed.archived, 3); assert.equal(mixed.failed >= 1, true);
});
test("arquivamento independe do e-mail: o lote nunca envia nada, e o cron exige só R2 + liberação fiscal", () => {
  const archive = src("lib/nfse/archiveNfseDocuments.ts"); const worker = src("lib/nfse/deliveryWorker.ts"); const cron = src("app/api/cron/nfse-delivery/route.ts");
  assert.doesNotMatch(archive, /sendFiscalEmail|resendDelivery|isNfseEmailConfigured/);
  const archGate = worker.slice(worker.indexOf("export function isNfseArchiveEnabled"), worker.indexOf("export function isNfseDeliveryEnabled"));
  assert.match(archGate, /NFSE_AVAILABLE_IN_THIS_RELEASE/); assert.match(archGate, /NFSE_DELIVERY_ENABLED/); assert.match(archGate, /isNfseR2Configured/);
  assert.doesNotMatch(archGate, /isNfseEmailConfigured/);
  assert.match(cron, /isNfseArchiveEnabled\(\)/); assert.match(cron, /authorization/);
  assert.ok(cron.indexOf("archivePendingNfseNotes(") < cron.indexOf("runNfseDeliveryBatch("), "arquiva antes de tentar o e-mail");
  assert.equal(isNfseArchiveEnabled(), false, "emissão/entrega continuam bloqueadas nesta versão");
});

// ======================================== WORKER DE ENTREGA (mocks, duplicação e concorrência) ========================================
function workerSetup(attempt: Partial<Row> = {}, noteOver: Row = {}, send?: DeliveryWorkerDeps["send"], r2opts?: Parameters<typeof mockArchiveDeps>[0]) {
  const { db, admin } = fakeDb({ nfse_delivery_attempts: [{ id: "q1", issued_note_id: "n1", channel: "email", status: "queued", requested_at: "2026-11-14T10:00:00Z", recipient_snapshot: "cliente@exemplo.test", ...attempt }] }, UNIQ);
  const r2 = mockArchiveDeps(r2opts); const sent: any[] = [];
  const deps: DeliveryWorkerDeps = {
    isEnabled: () => true,
    getNote: async () => note("n1", noteOver),
    archive: (a, n) => archiveNfseDocuments(a, n, r2.deps),
    read: r2.deps.read,
    send: send ?? (async (input) => { sent.push(input); return { providerMessageId: `re-msg-${sent.length}` }; }),
  };
  return { db, admin, r2, sent, deps };
}
const status = (db: Db) => db.tables.nfse_delivery_attempts[0].status;

test("entrega: arquiva, envia PDF+XML originais UMA vez e registra aceito com o identificador (sem declarar entrega)", async () => {
  const w = workerSetup(); const out = await runNfseDeliveryBatch(w.admin, w.deps);
  assert.deepEqual(out.outcomes, ["accepted"]);
  assert.equal(w.sent.length, 1); assert.equal(w.sent[0].to, "cliente@exemplo.test");
  assert.deepEqual(w.sent[0].attachments.map((a: any) => a.contentType).sort(), ["application/pdf", "application/xml"]);
  assert.ok(w.sent[0].attachments.find((a: any) => a.contentType === "application/xml").bytes.equals(Buffer.from('<NFSe id="n1"/>')));
  const row = w.db.tables.nfse_delivery_attempts[0];
  assert.equal(row.status, "accepted"); assert.equal(row.provider, "resend"); assert.equal(row.provider_message_id, "re-msg-1");
  assert.match(row.response_summary, /ainda não confirmada/); assert.equal(row.delivered_at, undefined);
  assert.equal(assetsOf(w.db, "n1").length, 3);
});
test("concorrência: dois workers simultâneos na mesma fila enviam o e-mail uma única vez", async () => {
  const w = workerSetup(); const [a, b] = await Promise.all([runNfseDeliveryBatch(w.admin, w.deps), runNfseDeliveryBatch(w.admin, w.deps)]);
  assert.equal(w.sent.length, 1, "um único POST ao provedor");
  assert.equal(a.processed + b.processed, 1); assert.equal(assetsOf(w.db, "n1").length, 3);
});
test("sem destinatário: arquiva os documentos, NÃO envia e registra missing_recipient", async () => {
  const w = workerSetup({ recipient_snapshot: null }); const out = await runNfseDeliveryBatch(w.admin, w.deps);
  assert.deepEqual(out.outcomes, ["missing_recipient"]); assert.equal(w.sent.length, 0); assert.equal(assetsOf(w.db, "n1").length, 3);
});
test("falha do e-mail (rejeição do provedor) não impede o arquivamento e vira 'failed' sem repetir sozinha", async () => {
  const w = workerSetup({}, {}, async () => { throw new EmailRejectedByProviderError("Provedor recusou envio (HTTP 422)."); });
  assert.deepEqual((await runNfseDeliveryBatch(w.admin, w.deps)).outcomes, ["failed"]);
  assert.equal(assetsOf(w.db, "n1").length, 3, "documentos arquivados mesmo com o e-mail falhando");
  assert.equal((await runNfseDeliveryBatch(w.admin, w.deps)).processed, 0, "não reprocessa sozinho");
});
test("timeout/resultado incerto: 'uncertain', nunca reenvia automaticamente e só reenvio manual consciente é permitido", async () => {
  let calls = 0; const w = workerSetup({}, {}, async () => { calls++; throw new EmailOutcomeUncertainError("Conexão com provedor inconclusiva."); });
  assert.deepEqual((await runNfseDeliveryBatch(w.admin, w.deps)).outcomes, ["uncertain"]);
  await runNfseDeliveryBatch(w.admin, w.deps); await runNfseDeliveryBatch(w.admin, w.deps);
  assert.equal(calls, 1); assert.equal(status(w.db), "uncertain"); assert.equal(canManuallyResend("uncertain"), true);
  assert.match(w.db.tables.nfse_delivery_attempts[0].response_summary, /Verificar no provedor/);
});
test("R2 indisponível: não envia e-mail, registra 'failed' sem expor detalhes sensíveis e o lote não quebra", async () => {
  const w = workerSetup({}, {}, undefined, { failSave: true });
  const out = await runNfseDeliveryBatch(w.admin, w.deps);
  assert.deepEqual(out.outcomes, ["failed"]); assert.equal(w.sent.length, 0); assert.equal(assetsOf(w.db, "n1").length, 0);
  assert.doesNotMatch(String(w.db.tables.nfse_delivery_attempts[0].response_summary), /re_|whsec_|Bearer|secret/i);
});
test("nota de homologação ou sem XML autorizado: nada é arquivado nem enviado", async () => {
  for (const over of [{ environment: "homologation" }, { nfseXml: null }, { accessKey: null }]) {
    const w = workerSetup({}, over); const out = await runNfseDeliveryBatch(w.admin, w.deps);
    assert.deepEqual(out.outcomes, ["failed"]); assert.equal(w.sent.length, 0); assert.equal(assetsOf(w.db, "n1").length, 0);
  }
});
test("worker desabilitado (sem liberação fiscal/credenciais): recusa executar", async () => {
  const w = workerSetup(); await assert.rejects(runNfseDeliveryBatch(w.admin, { ...w.deps, isEnabled: () => false }), /desabilitada/);
  assert.equal(w.sent.length, 0);
});
test("e-mail fiscal tem prioridade; sem ele usa o e-mail principal do cadastro; sem nenhum, não há destinatário", () => {
  assert.equal(fiscalRecipient({ fiscalEmail: "fiscal@exemplo.test", email: "principal@exemplo.test" }), "fiscal@exemplo.test");
  assert.equal(fiscalRecipient({ fiscalEmail: "  ", email: "principal@exemplo.test" }), "principal@exemplo.test");
  assert.equal(fiscalRecipient({ fiscalEmail: null, email: null }), null);
  assert.match(readFileSync(new URL("../../../supabase/migrations/20261122340700_nfse_delivery_enqueue_trigger.sql", import.meta.url), "utf8"), /coalesce\(nullif\(btrim\(fiscal_email\),''\),nullif\(btrim\(email\),''\)\)/);
});

// ============================================== PERMISSÕES SEPARADAS ==============================================
test("catálogo: consultar documentos, enviar/reencaminhar e cancelar são ações distintas e somente da administração", () => {
  const nfse = STAFF_MODULE_ACTIONS.filter((a) => a.module === "nfse");
  for (const key of ["documentos_consultar", "documentos_enviar", "notas_cancelar"]) assert.equal(nfse.filter((a) => a.key === key).length, 1, key);
  for (const key of ["documentos_consultar", "documentos_enviar", "notas_cancelar"]) assert.equal((nfse.find((a) => a.key === key) as any).adminOnly, true, key);
});
test("ações e rotas usam a permissão certa: consultar (histórico, XML, DANFSe), enviar (reenvio e WhatsApp) e cancelar só no cancelamento", () => {
  const actions = src("app/sistema/nfse/notas/[id]/delivery-actions.ts");
  const pick = (name: string) => actions.slice(actions.indexOf(`export async function ${name}`), actions.indexOf("export async function", actions.indexOf(`export async function ${name}`) + 10) > 0 ? actions.indexOf("export async function", actions.indexOf(`export async function ${name}`) + 10) : undefined);
  assert.match(pick("listNfseDeliveriesAction"), /"documentos_consultar"/);
  for (const fn of ["queueNfseEmailResendAction", "registerNfseWhatsAppOpenAction", "confirmNfseWhatsAppManualAction"]) assert.match(pick(fn), /"documentos_enviar"/, fn);
  assert.doesNotMatch(actions, /notas_cancelar/);
  assert.match(src("app/sistema/nfse/notas/[id]/xml/route.ts"), /"documentos_consultar"/);
  assert.match(src("app/sistema/nfse/notas/[id]/danfse/route.ts"), /checkModuleAction\("nfse","documentos_consultar"\)/);
  assert.match(src("app/sistema/nfse/notas/[id]/cancellation-actions.ts"), /"notas_cancelar"/);
  assert.doesNotMatch(src("app/sistema/nfse/notas/[id]/xml/route.ts") + src("app/sistema/nfse/notas/[id]/danfse/route.ts"), /checkModuleAction\("nfse",\s*"notas_cancelar"\)/);
});
test("migration C (não aplicada) amplia a CHECK com as duas ações novas e o painel não usa window.confirm", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20261122340800_nfse_document_permissions.sql", import.meta.url), "utf8");
  assert.match(sql, /'documentos_consultar', 'documentos_enviar'/); assert.match(sql, /drop constraint if exists staff_module_actions_known_pair/);
  assert.doesNotMatch(sql, /insert into|update public|delete from/i, "só amplia a lista; não concede permissão a ninguém");
  const panel = src("features/nfse/NfseDeliveryPanel.tsx");
  assert.doesNotMatch(panel, /window\.confirm/); assert.match(panel, /confirmDialog/);
  assert.match(panel, /não confirma entrega|isto não confirma entrega/);
});
