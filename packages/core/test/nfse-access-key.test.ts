import { test } from "node:test";
import assert from "node:assert/strict";
import { NFSE_ACCESS_KEY_PATTERN, isValidNfseAccessKey } from "../src/nfse/access-key";

const numeric = "421640" + "23970969000190" + "0".repeat(30);
const alphanumeric = "421640" + "ABC123DEF45678" + "0".repeat(30);

test("TSChaveNFSe suporta inscricao federal numerica ou alfanumerica em caixa alta", () => {
  assert.equal(numeric.length, 50);
  assert.equal(alphanumeric.length, 50);
  assert.equal(isValidNfseAccessKey(numeric), true);
  assert.equal(isValidNfseAccessKey(alphanumeric), true);
  assert.ok(NFSE_ACCESS_KEY_PATTERN.test(alphanumeric));
});

test("TSChaveNFSe bloqueia chave incompleta, invalida, alterada ou com caracteres fora do XSD", () => {
  for (const invalid of [
    "",
    "1".repeat(49),
    "1".repeat(51),
    "421640" + "abc123def45678" + "0".repeat(30),
    "421640" + "ABC123DEF45678" + "0".repeat(29) + "A",
    "421640" + "ABC123DEF45678" + "0".repeat(29),
    "421640" + "ABC123DEF45678" + "0".repeat(29) + "-",
    "  " + numeric,
  ]) {
    assert.equal(isValidNfseAccessKey(invalid), false, "Chave invalida aceita: " + invalid);
  }
  assert.equal(isValidNfseAccessKey(null), false);
  assert.equal(isValidNfseAccessKey(undefined), false);
});
