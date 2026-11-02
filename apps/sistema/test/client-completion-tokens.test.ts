import test from "node:test";
import assert from "node:assert/strict";
import { clientCompletionTokenHash, clientCompletionTokenUsable } from "../src/lib/clientes/clientCompletionTokens";

test("clientCompletionTokenHash é determinístico e nunca devolve o token em claro", () => {
  const hash = clientCompletionTokenHash("token-de-teste-123");
  assert.equal(hash, clientCompletionTokenHash("token-de-teste-123"));
  assert.notEqual(hash, "token-de-teste-123");
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test("clientCompletionTokenHash nunca colide entre tokens diferentes (amostra)", () => {
  const a = clientCompletionTokenHash("token-a");
  const b = clientCompletionTokenHash("token-b");
  assert.notEqual(a, b);
});

function row(overrides: Partial<Parameters<typeof clientCompletionTokenUsable>[0]> = {}) {
  return {
    id: "tok-1", client_id: "cli-1", channel: "email" as const, channel_value: "a@b.com",
    status: "pending" as const, expires_at: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

test("clientCompletionTokenUsable: pending e verified ainda dentro da validade são usáveis", () => {
  assert.equal(clientCompletionTokenUsable(row({ status: "pending" })), true);
  assert.equal(clientCompletionTokenUsable(row({ status: "verified" })), true);
});

test("clientCompletionTokenUsable: completed, expired e revoked NUNCA são usáveis, mesmo com expires_at no futuro", () => {
  assert.equal(clientCompletionTokenUsable(row({ status: "completed" })), false);
  assert.equal(clientCompletionTokenUsable(row({ status: "expired" })), false);
  assert.equal(clientCompletionTokenUsable(row({ status: "revoked" })), false);
});

test("clientCompletionTokenUsable: pending/verified PASSADO o prazo (expires_at no passado) também não são usáveis", () => {
  const expired = new Date(Date.now() - 1000).toISOString();
  assert.equal(clientCompletionTokenUsable(row({ status: "pending", expires_at: expired })), false);
  assert.equal(clientCompletionTokenUsable(row({ status: "verified", expires_at: expired })), false);
});
