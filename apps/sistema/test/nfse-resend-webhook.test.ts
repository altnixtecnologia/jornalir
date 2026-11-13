import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { handleResendWebhook } from "../src/lib/nfse/resendWebhookHandler";
import { NFSE_AVAILABLE_IN_THIS_RELEASE } from "../src/lib/release/releasePolicy";

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const secret = "whsec_" + Buffer.from("segredo-de-testes-32-bytes-seguro!").toString("base64");
const NOW = 1794528000;

type Row = Record<string, unknown>;
/** Banco falso em memória: só implementa o encadeamento que o handler usa. */
function fakeAdmin(rows: Row[], fail?: { code?: string; message: string }) {
  let adminCalls = 0;
  const client = {
    from(table: string) {
      assert.equal(table, "nfse_delivery_attempts", "o webhook só pode tocar a tabela de tentativas");
      let patch: Row = {}; const eqs: Array<[string, unknown]> = []; let inCol: [string, unknown[]] | null = null;
      const q: any = {
        update(p: Row) { patch = p; return q; },
        eq(c: string, v: unknown) { eqs.push([c, v]); return q; },
        in(c: string, v: unknown[]) { inCol = [c, v]; return q; },
        select(_: string) {
          if (fail) return Promise.resolve({ data: null, error: fail });
          const hit = rows.filter((r) => eqs.every(([c, v]) => r[c] === v) && (!inCol || inCol[1].includes(r[inCol[0]])));
          hit.forEach((r) => Object.assign(r, patch));
          return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
        },
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, getAdmin: () => { adminCalls++; return client as unknown as SupabaseClient; }, calls: () => adminCalls };
}
const attempt = (status = "accepted", extra: Row = {}): Row => ({
  id: "a1", channel: "email", provider: "resend", provider_message_id: "email-1", status,
  recipient_snapshot: "x@example.com", ...extra,
});
function signed(type: string, emailId = "email-1", over: { id?: string; ts?: number; created_at?: string } = {}) {
  const body = JSON.stringify({ type, created_at: over.created_at ?? "2026-11-12T23:00:00.000Z", data: { email_id: emailId } });
  const id = over.id ?? "msg_abc123"; const ts = String(over.ts ?? NOW);
  const sig = "v1," + createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${ts}.${body}`).digest("base64");
  return { body, headers: { id, timestamp: ts, signature: sig } };
}
const call = (db: ReturnType<typeof fakeAdmin>, ev: ReturnType<typeof signed>, ...sec: [] | [string | undefined]) =>
  handleResendWebhook({ rawBody: ev.body, headers: ev.headers, secret: sec.length ? sec[0] : secret, getAdmin: db.getAdmin, nowMs: NOW * 1000 });

test("assinatura: inválida, ausente, adulterada ou expirada => 401 e o banco nem é acessado", async () => {
  const rows = [attempt()]; const db = fakeAdmin(rows); const ev = signed("email.delivered");
  assert.equal((await call(db, { ...ev, headers: { ...ev.headers, signature: "v1,invalida" } })).status, 401);
  assert.equal((await call(db, { ...ev, headers: { id: null, timestamp: null, signature: null } })).status, 401);
  assert.equal((await call(db, { ...ev, body: ev.body + " " })).status, 401);
  assert.equal((await call(db, signed("email.delivered", "email-1", { ts: NOW - 3600 }))).status, 401);
  assert.equal((await call(db, ev, "whsec_" + Buffer.from("outro-segredo").toString("base64"))).status, 401);
  assert.equal(db.calls(), 0);
  assert.equal(rows[0].status, "accepted");
});
test("sem RESEND_WEBHOOK_SECRET => 503 (nunca aceita sem segredo)", async () => {
  const db = fakeAdmin([attempt()]);
  assert.equal((await call(db, signed("email.delivered"), undefined)).status, 503);
  assert.equal((await call(db, signed("email.delivered"), "")).status, 503);
  assert.equal(db.calls(), 0);
});
test("os quatro eventos atualizam a tentativa correspondente (e só ela)", async () => {
  for (const [type, status, field] of [["email.delivered", "delivered", "delivered_at"], ["email.bounced", "bounced", "failed_at"], ["email.failed", "failed", "failed_at"], ["email.complained", "bounced", "failed_at"]] as const) {
    const rows = [attempt(), attempt("accepted", { id: "a2", provider_message_id: "email-2" })];
    const r = await call(fakeAdmin(rows), signed(type));
    assert.equal(r.status, 200); assert.equal(r.body.updated, 1);
    assert.equal(rows[0].status, status); assert.equal(rows[0][field], "2026-11-12T23:00:00.000Z");
    assert.equal(rows[1].status, "accepted", "outra tentativa não pode mudar");
  }
  const rows = [attempt()];
  await call(fakeAdmin(rows), signed("email.complained"));
  assert.match(String(rows[0].response_summary), /spam|reclama/i);
});
test("evento duplicado: segundo recebimento não altera nada", async () => {
  const rows = [attempt()]; const db = fakeAdmin(rows);
  await call(db, signed("email.delivered", "email-1", { created_at: "2026-11-12T23:00:00.000Z" }));
  const snapshot = JSON.stringify(rows);
  const again = await call(db, signed("email.delivered", "email-1", { created_at: "2026-11-12T23:30:00.000Z", id: "msg_outro" }));
  assert.equal(again.status, 200); assert.equal(again.body.updated, 0);
  assert.equal(JSON.stringify(rows), snapshot);
});
test("fora de ordem: confirmação antiga nunca sobrescreve estado mais recente", async () => {
  for (const [first, second, final] of [
    ["email.bounced", "email.delivered", "bounced"], ["email.failed", "email.delivered", "failed"],
    ["email.delivered", "email.failed", "delivered"], ["email.bounced", "email.failed", "bounced"],
    ["email.failed", "email.bounced", "failed"], ["email.delivered", "email.bounced", "bounced"],
    ["email.bounced", "email.bounced", "bounced"],
  ] as const) {
    const rows = [attempt()]; const db = fakeAdmin(rows);
    await call(db, signed(first)); await call(db, signed(second, "email-1", { id: "msg_2" }));
    assert.equal(rows[0].status, final, `${first} depois ${second}`);
  }
});
test("identificador desconhecido, outro provedor ou WhatsApp: 200 sem alterar nada", async () => {
  const rows = [attempt("accepted", { provider: "outro" }), attempt("opened", { id: "w1", channel: "whatsapp", provider: "resend" })];
  const snap = JSON.stringify(rows);
  const r = await call(fakeAdmin(rows), signed("email.delivered", "id-que-nao-existe"));
  assert.equal(r.status, 200); assert.equal(r.body.updated, 0);
  assert.equal((await call(fakeAdmin(rows), signed("email.delivered", "email-1"))).body.updated, 0);
  assert.equal(JSON.stringify(rows), snap);
});
test("eventos que não usamos ou sem identificador: 200 sem tocar no banco", async () => {
  const db = fakeAdmin([attempt()]);
  for (const t of ["email.sent", "email.opened", "email.clicked", "email.delivery_delayed"]) assert.equal((await call(db, signed(t))).status, 200);
  const semId = signed("email.delivered"); const noId = JSON.stringify({ type: "email.delivered", data: {} });
  const sig = "v1," + createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`msg_abc123.${NOW}.${noId}`).digest("base64");
  assert.equal((await call(db, { body: noId, headers: { ...semId.headers, signature: sig } })).status, 200);
  assert.equal(db.calls(), 0);
});
test("migration ainda não aplicada (tabela inexistente) => 503; outro erro de banco => 500; nunca 200 perdendo o evento", async () => {
  assert.equal((await call(fakeAdmin([], { code: "PGRST205", message: "Could not find the table 'public.nfse_delivery_attempts' in the schema cache" }), signed("email.delivered"))).status, 503);
  assert.equal((await call(fakeAdmin([], { code: "42P01", message: 'relation "nfse_delivery_attempts" does not exist' }), signed("email.delivered"))).status, 503);
  assert.equal((await call(fakeAdmin([], { code: "XX000", message: "boom" }), signed("email.delivered"))).status, 500);
});
test("horário do evento implausível (futuro/ano 1970) é substituído pelo horário atual", async () => {
  for (const created_at of ["2099-01-01T00:00:00Z", "1970-01-01T00:00:00Z", "lixo"]) {
    const rows = [attempt()]; await call(fakeAdmin(rows), signed("email.delivered", "email-1", { created_at }));
    assert.equal(rows[0].delivered_at, new Date(NOW * 1000).toISOString());
  }
});
test("webhook é independente da emissão, mas a emissão fiscal continua bloqueada", async () => {
  assert.equal(NFSE_AVAILABLE_IN_THIS_RELEASE, false);
  const prev = { v: process.env.VERCEL_ENV, d: process.env.NFSE_DELIVERY_ENABLED };
  delete process.env.VERCEL_ENV; delete process.env.NFSE_DELIVERY_ENABLED;
  try {
    const rows = [attempt()];
    assert.equal((await call(fakeAdmin(rows), signed("email.delivered"))).status, 200);
    assert.equal(rows[0].status, "delivered");
  } finally { if (prev.v !== undefined) process.env.VERCEL_ENV = prev.v; if (prev.d !== undefined) process.env.NFSE_DELIVERY_ENABLED = prev.d; }
});
test("a rota do webhook não envia e-mail, não emite nota e não expõe documentos", () => {
  const route = src("app/api/webhooks/nfse-email/route.ts"); const handler = src("lib/nfse/resendWebhookHandler.ts");
  for (const text of [route, handler]) {
    assert.doesNotMatch(text, /isNfseDeliveryEnabled|NFSE_DELIVERY_ENABLED|NFSE_AVAILABLE_IN_THIS_RELEASE/);
    assert.doesNotMatch(text, /sendFiscalEmail|api\.resend\.com|deliveryWorker|archiveNfseDocuments|nfse_issued_notes|readNfseDocument|nfseXml|r2/i);
  }
  assert.match(handler, /verifyResendWebhook/);
  assert.match(handler, /\.eq\("provider", "resend"\)/);
  assert.match(handler, /\.in\("status", rule\.allowedFrom\)/);
  assert.doesNotMatch(handler, /\.insert\(|\.delete\(|\.upsert\(/);
});
