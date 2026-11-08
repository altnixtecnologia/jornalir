import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  issueGoogleSignatureNonce, validateGoogleSignatureNonce,
  verifyGoogleSignatureCredential,
} from "../src/lib/signatures/googleSignatureProof";

const secret = "0123456789abcdef0123456789abcdef";
const token = "c".repeat(64);
const start = Date.UTC(2026, 10, 8, 19, 0, 0);

test("Google opcional: nonce é vinculado ao convite, modalidade, prazo e segredo", () => {
  const nonce = issueGoogleSignatureNonce(token, "commercial", secret, start);
  assert.doesNotThrow(() => validateGoogleSignatureNonce(nonce, token, "commercial", secret, start + 1));
  assert.throws(() => validateGoogleSignatureNonce(nonce, token, "institutional", secret, start + 1), /não corresponde/);
  assert.throws(() => validateGoogleSignatureNonce(nonce, "a".repeat(64), "commercial", secret, start + 1), /não corresponde/);
  assert.throws(() => validateGoogleSignatureNonce(nonce, token, "commercial", secret, start + 6 * 60 * 1000), /expirou/);
  assert.throws(() => validateGoogleSignatureNonce(nonce + "x", token, "commercial", secret, start), /inválida/);
});

test("Google opcional: ID token RS256 é conferido com chave pública e não troca identidade do convite", async () => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = keys.publicKey.export({ format: "jwk" });
  const nowSeconds = Math.floor(start / 1000);
  const clientId = "teste-signature-123.apps.googleusercontent.com";
  const nonce = issueGoogleSignatureNonce(token, "institutional", secret, start);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-key" })).toString("base64url");
  const base = {
    iss: "https://accounts.google.com",
    aud: clientId,
    sub: "105443322110998877665",
    email: "cliente@exemplo.com.br",
    email_verified: true,
    nonce,
    iat: nowSeconds,
    exp: nowSeconds + 300,
  };
  const makeCredential = (payload: Record<string, unknown>, headerText = header): string => {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const unsigned = headerText + "." + body;
    const signature = sign("RSA-SHA256", Buffer.from(unsigned), keys.privateKey).toString("base64url");
    return unsigned + "." + signature;
  };
  const options = {
    publicKeys: async () => [{ kid: "test-key", kty: "RSA", use: "sig", alg: "RS256", n: jwk.n, e: jwk.e }],
    nowSeconds,
  };
  const verified = await verifyGoogleSignatureCredential(makeCredential(base), nonce, base.email, clientId, options);
  assert.equal(verified.subject, base.sub);
  assert.equal(verified.email, base.email);

  await assert.rejects(verifyGoogleSignatureCredential(makeCredential({ ...base, aud: "outro-app" }), nonce, base.email, clientId, options), /não confirmada/);
  await assert.rejects(verifyGoogleSignatureCredential(makeCredential({ ...base, nonce: "outro" }), nonce, base.email, clientId, options), /não confirmada/);
  await assert.rejects(verifyGoogleSignatureCredential(makeCredential({ ...base, email_verified: false }), nonce, base.email, clientId, options), /não confirmada/);
  await assert.rejects(verifyGoogleSignatureCredential(makeCredential({ ...base, exp: nowSeconds - 1 }), nonce, base.email, clientId, options), /não confirmada/);
  await assert.rejects(verifyGoogleSignatureCredential(makeCredential(base), nonce, "outra@exemplo.com.br", clientId, options), /não confirmada/);

  const fakeSignature = makeCredential(base).split(".");
  fakeSignature[2] = Buffer.alloc(256, 42).toString("base64url");
  await assert.rejects(verifyGoogleSignatureCredential(fakeSignature.join("."), nonce, base.email, clientId, options), /Assinatura Google inválida/);
});
