import { test } from "node:test";
import assert from "node:assert/strict";
import { extractEmbeddedDpsIdentity, extractPrestadorCnpj } from "../src/nfse/dps-builder";

const realIssuer = "23970969000190";
const otherParty = "11111111000199";
const dpsId = "DPS4216404199999999999999999999900001000000000001";

test("consulta fiscal: emitente não é o primeiro CNPJ encontrado", () => {
  const nfse = `<NFSe><infNFSe><toma><CNPJ>${otherParty}</CNPJ></toma><emit><CNPJ>${realIssuer}</CNPJ></emit></infNFSe></NFSe>`;
  const dps = `<DPS><infDPS><toma><CNPJ>${otherParty}</CNPJ></toma><prest><CNPJ>${realIssuer}</CNPJ></prest></infDPS></DPS>`;
  assert.equal(extractPrestadorCnpj(nfse), realIssuer);
  assert.equal(extractPrestadorCnpj(dps), realIssuer);
  assert.equal(extractPrestadorCnpj(`<NFSe><infNFSe><toma><CNPJ>${otherParty}</CNPJ></toma></infNFSe></NFSe>`), undefined);
  assert.equal(extractPrestadorCnpj(`<DPS><infDPS><toma><CNPJ>${otherParty}</CNPJ></toma></infDPS></DPS>`), undefined);
  assert.equal(extractPrestadorCnpj(`<outro><CNPJ>${realIssuer}</CNPJ></outro>`), undefined);
});

test("conciliação: ambiente fiscal vem da DPS embutida, nunca do cabeçalho da NFS-e", () => {
  const xml = `<NFSe><infNFSe><tpAmb>1</tpAmb><DPS><infDPS Id="${dpsId}"><tpAmb>2</tpAmb></infDPS></DPS></infNFSe></NFSe>`;
  assert.deepEqual(extractEmbeddedDpsIdentity(xml), { dpsId, tpAmb: "2" });
  assert.deepEqual(extractEmbeddedDpsIdentity(`<NFSe><infNFSe><tpAmb>2</tpAmb></infNFSe></NFSe>`), {});
  assert.deepEqual(extractEmbeddedDpsIdentity(`<DPS><infDPS Id="${dpsId}"><tpAmb>2</tpAmb></infDPS></DPS>`), {});
});
