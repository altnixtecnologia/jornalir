import test from "node:test";
import assert from "node:assert/strict";
import { clientFieldsForBase } from "../src/lib/signatures/externalSignaturePlacement";
import { autoLayout, type SignerSlot } from "../src/lib/signatures/signaturePlacement";

const actors: SignerSlot[] = [
  { key: "contratada-1", role: "contratada", label: "Jornal IR" },
  { key: "contratante-1", role: "contratante", label: "Cliente" },
];
const digest = "a".repeat(64);

test("3B: só o cliente ocupa campos próprios; rubrica em cada página e assinatura na folha final", () => {
  const fields = autoLayout(3, actors).fields;
  const found = clientFieldsForBase({ final_sha256: digest, layout_mode: "automatic", layout_fields: fields }, digest);
  assert.ok(found);
  assert.equal(found.hasPlaceholders, true);
  assert.equal(found.fields.filter((f) => f.kind === "initials").length, 3);
  assert.equal(found.fields.filter((f) => f.kind === "signature").length, 1);
  assert.ok(found.fields.every((f) => f.signerKey === "contratante-1"));
});

test("3B: versão cumulativa não sobrescreve imagem do primeiro cliente", () => {
  const fields = autoLayout(2, actors).fields;
  assert.equal(clientFieldsForBase({ final_sha256: digest, layout_mode: "automatic", layout_fields: fields }, "b".repeat(64)), null);
});

test("3B: posicionamento manual não recebe folha nova nem marcação antecipada", () => {
  const fields = [
    { kind: "signature" as const, signerKey: "contratada-1", page: 1, x: 0.1, y: 0.7, width: 0.3, height: 0.1 },
    { kind: "signature" as const, signerKey: "contratante-1", page: 1, x: 0.55, y: 0.7, width: 0.3, height: 0.1 },
  ];
  const found = clientFieldsForBase({ final_sha256: digest, layout_mode: "manual", layout_fields: fields }, digest);
  assert.ok(found);
  assert.equal(found.hasPlaceholders, false);
  assert.deepEqual(found.fields, [fields[1]]);
});

test("3B: recusa PDF sem campo único do contratante ou coordenadas inválidas", () => {
  assert.throws(() => clientFieldsForBase({ final_sha256: digest, layout_mode: "manual", layout_fields: [] }, digest), /campo único/);
  assert.throws(() => clientFieldsForBase({
    final_sha256: digest, layout_mode: "manual",
    layout_fields: [{ kind: "signature", signerKey: "contratante-1", page: 1, x: -0.5, y: 0.4, width: 0.2, height: 0.1 }],
  }, digest), /inválido/);
});
