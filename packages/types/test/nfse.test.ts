import { test } from "node:test";
import assert from "node:assert/strict";
import type { Client, NfseServiceProfile } from "../src";
import { buildFiscalSnapshotFromServiceProfile, buildTomadorSnapshotFromClient, computeCertificateEffectiveStatus, listSelectableServiceProfiles } from "../src";

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    reference: "IR-CLI-2026-000001",
    kind: "individual",
    status: "active",
    fullName: "Maria Souza",
    cpf: "11144477735",
    address: { zip: "88990000", street: "Rua A", number: "10", city: "São João do Sul", state: "SC" },
    roles: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeServiceProfile(overrides: Partial<NfseServiceProfile> = {}): NfseServiceProfile {
  return {
    id: "profile-1",
    name: "Publicidade",
    active: true,
    cTribNac: "010101",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// NFS-e, Parte 1 — snapshot (tomador/perfil fiscal) nunca compartilha
// referência com o objeto original: editar um lado nunca altera o
// outro (item 21).

test("snapshot do tomador não muda quando o cliente original é alterado depois", () => {
  const client = makeClient();
  const snapshot = buildTomadorSnapshotFromClient(client, "Maria Souza");
  client.address.city = "Outra Cidade";
  client.fullName = "Outro Nome";
  assert.equal(snapshot.city, "São João do Sul");
  assert.equal(snapshot.name, "Maria Souza");
});

test("editar o snapshot do tomador não altera o cliente original", () => {
  const client = makeClient();
  const snapshot = buildTomadorSnapshotFromClient(client, "Maria Souza");
  snapshot.city = "Cidade Editada no Rascunho";
  assert.equal(client.address.city, "São João do Sul");
});

test("aplicação de perfil no rascunho copia os campos fiscais corretamente", () => {
  const profile = makeServiceProfile({ cTribMun: "9999", cNBS: "123456789", issqnTaxation: "Tributado no município do prestador" });
  const snapshot = buildFiscalSnapshotFromServiceProfile(profile);
  assert.equal(snapshot.cTribNac, "010101");
  assert.equal(snapshot.cTribMun, "9999");
  assert.equal(snapshot.cNBS, "123456789");
  assert.equal(snapshot.issqnTaxation, "Tributado no município do prestador");
  assert.equal(snapshot.sourceServiceProfileId, "profile-1");
});

test("override no rascunho não altera o perfil de serviço de origem", () => {
  const profile = makeServiceProfile();
  const snapshot = buildFiscalSnapshotFromServiceProfile(profile);
  snapshot.cTribNac = "999999";
  assert.equal(profile.cTribNac, "010101");
});

test("perfis inativos não aparecem na lista de seleção pra uma nova emissão", () => {
  const profiles = [makeServiceProfile({ id: "a", active: true }), makeServiceProfile({ id: "b", active: false })];
  const selectable = listSelectableServiceProfiles(profiles);
  assert.deepEqual(selectable.map((item) => item.id), ["a"]);
});

test("certificado: not_configured nunca aparece como expirado", () => {
  const status = computeCertificateEffectiveStatus("not_configured", "2020-01-01", new Date("2026-01-01"));
  assert.equal(status, "not_configured");
});

test("certificado: configured com validade no passado é EXPIRED (derivado, nunca gravado)", () => {
  const status = computeCertificateEffectiveStatus("configured", "2026-01-01", new Date("2026-06-01"));
  assert.equal(status, "expired");
});

test("certificado: configured com validade no futuro continua configured", () => {
  const status = computeCertificateEffectiveStatus("configured", "2027-01-01", new Date("2026-06-01"));
  assert.equal(status, "configured");
});
