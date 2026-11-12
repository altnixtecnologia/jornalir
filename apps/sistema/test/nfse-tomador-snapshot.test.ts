import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { NfseTomadorSnapshot } from "@ir/types";
import { resolveUpdateTomadorSnapshot } from "../src/lib/nfse/draftTomadorPolicy";

const original: NfseTomadorSnapshot = {
  sourceClientId: "cliente-1", kind: "company", name: "Empresa Exemplo",
  cnpj: "123", city: "Cidade A", state: "SC",
};
const fromMaster: NfseTomadorSnapshot = { ...original, city: "Cidade B", email: "fiscal@example.test" };

test("sem refresh preserva snapshot historico mesmo se o cliente atual mudou", () => {
  assert.deepEqual(resolveUpdateTomadorSnapshot({
    previousClientId: "cliente-1", selectedClientId: "cliente-1",
    previous: original, submitted: { ...original, email: "" }, master: fromMaster,
  }), original);
});

test("refresh so aceita dados que coincidam com o cadastro mestre", () => {
  assert.deepEqual(resolveUpdateTomadorSnapshot({
    previousClientId: "cliente-1", selectedClientId: "cliente-1",
    previous: original, submitted: { ...fromMaster }, master: fromMaster,
  }), fromMaster);
});

test("troca de cliente usa somente dados do cadastro mestre do novo tomador", () => {
  const other: NfseTomadorSnapshot = {
    sourceClientId: "cliente-2", kind: "individual", name: "Outro Cliente", cpf: "000",
  };
  assert.deepEqual(resolveUpdateTomadorSnapshot({
    previousClientId: "cliente-1", selectedClientId: "cliente-2",
    previous: original, submitted: { ...other, name: "Nome adulterado" }, master: other,
  }), other);
});

test("dados forjados e origem inconsistente falham fechados", () => {
  assert.throws(() => resolveUpdateTomadorSnapshot({
    previousClientId: "cliente-1", selectedClientId: "cliente-1",
    previous: original, submitted: { ...original, cnpj: "outro" }, master: fromMaster,
  }), /divergentes/);
  assert.throws(() => resolveUpdateTomadorSnapshot({
    previousClientId: "cliente-1", selectedClientId: "cliente-2",
    previous: original, submitted: original, master: fromMaster,
  }), /não corresponde/);
});

test("server actions nunca confiam em dados fiscais readonly e congelam transmissao incerta", () => {
  const source = readFileSync(new URL("../src/app/sistema/nfse/nova/actions.ts", import.meta.url), "utf8");
  assert.match(source, /canonical\.tomador = buildTomadorSnapshotFromClient\(/);
  assert.match(source, /canonical\.tomador = resolveUpdateTomadorSnapshot\(/);
  assert.match(source, /createIssuedNoteRepositorySupabase\(client\)\.getByDraftId\(id\)/);
  assert.match(source, /attempts\[0\]\?\.status === "pending"/);
  assert.match(source, /issuerSimplesNacionalOption: previous\.fiscal\.issuerSimplesNacionalOption/);
  assert.match(source, /issuerSimplesNacionalOption: issuer\?\.simplesNacionalOption/);
});

test("atalho de nova NFS-e do cliente respeita gate de release", () => {
  const source = readFileSync(new URL("../src/app/sistema/clientes/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /NFSE_AVAILABLE_IN_THIS_RELEASE \? \(/);
  assert.match(source, /\/sistema\/nfse\/nova\?clientId=/);
});
