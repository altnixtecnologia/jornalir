import test from "node:test";
import assert from "node:assert/strict";
import {
  createVerificationCode, decodeVerificationCode,
} from "../src/lib/signatures/publicVerification";

const id = "1d63e217-18f8-49ee-a92d-9c27e489b113";
const key = "signature-verification-local-test-key-123456789";

test("QR: código HMAC autentica modalidade e convite sem revelar dados pessoais", () => {
  const code = createVerificationCode("commercial", id, key);
  assert.match(code, /^v1-c-[a-f0-9]{32}-[a-f0-9]{48}$/);
  assert.deepEqual(decodeVerificationCode(code, key), { kind: "commercial", invitationId: id });
  assert.doesNotMatch(code, /@|nome|cpf|e-mail/i);
});

test("QR: adulteração, chave errada e formatos desconhecidos falham sem consulta ao banco", () => {
  const code = createVerificationCode("institutional", id, key);
  assert.equal(decodeVerificationCode(code, "outra-chave-maior-que-trinta-e-dois-caracteres"), null);
  assert.equal(decodeVerificationCode(code.replace("v1-i-", "v1-c-"), key), null);
  assert.equal(decodeVerificationCode(code.slice(0, -1) + (code.endsWith("a") ? "b" : "a"), key), null);
  assert.equal(decodeVerificationCode("nada", key), null);
  assert.throws(() => createVerificationCode("commercial", id, "curta"), /mínimo 32/);
});
