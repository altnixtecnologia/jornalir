import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDpsId } from "@ir/types";
import { validateDpsAgainstOfficialXsd } from "../src/nfse/xsd-validator";
import { buildDpsXml } from "../src/nfse/dps-builder";

/**
 * DPS mínima, montada à mão (NÃO via buildDpsXml, que ainda não é
 * 100% conforme — ver teste abaixo) só pra provar que o validador real
 * (xmllint-wasm + pacote oficial vendorizado) aceita um XML
 * genuinamente válido. `serie`/`nDPS` aqui são os elementos SIMPLES
 * (TSSerieDPS/TSNumDPS — nunca zero-padded, diferente do atributo `Id`
 * que exige largura fixa — ver buildDpsId em @ir/types).
 */
function buildMinimalValidDpsXml(): string {
  const dpsId = buildDpsId({ ibgeCode: "4216404", federalInscriptionType: "cnpj", federalInscription: "23970969000190", series: "1", number: 42 });
  return (
    `<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">` +
    `<infDPS Id="${dpsId}">` +
    `<tpAmb>2</tpAmb><dhEmi>2026-10-06T10:00:00-03:00</dhEmi><verAplic>JornalIR-1.0</verAplic>` +
    `<serie>1</serie><nDPS>42</nDPS><dCompet>2026-10-01</dCompet><tpEmit>1</tpEmit><cLocEmi>4216404</cLocEmi>` +
    `<prest><CNPJ>23970969000190</CNPJ><IM>1000546</IM><xNome>INFORMATIVO REGIONAL LTDA</xNome>` +
    `<regTrib><opSimpNac>1</opSimpNac><regEspTrib>0</regEspTrib></regTrib></prest>` +
    `<toma><CPF>11144477735</CPF><xNome>Maria Souza</xNome></toma>` +
    `<serv><locPrest><cLocPrestacao>4216404</cLocPrestacao></locPrest>` +
    `<cServ><cTribNac>010101</cTribNac><xDescServ>Veiculacao de anuncio publicitario</xDescServ></cServ></serv>` +
    `<valores><vServPrest><vServ>150.50</vServ></vServPrest>` +
    `<trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><indTotTrib>0</indTotTrib></totTrib></trib></valores>` +
    `</infDPS></DPS>`
  );
}

test("XSD válido aceita a fixture (DPS mínima, montada à mão, conforme o pacote oficial vendorizado)", async () => {
  const result = await validateDpsAgainstOfficialXsd(buildMinimalValidDpsXml());
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test("XSD inválido rejeita — nunca finge sucesso", async () => {
  const result = await validateDpsAgainstOfficialXsd("<DPS><infDPS></infDPS></DPS>");
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

// buildDpsXml (dps-builder.ts) é um builder SIMPLIFICADO pra um
// cenário inicial — AINDA NÃO gera uma DPS 100% conforme ao XSD oficial
// (faltam grupos obrigatórios como `prest.regTrib`, a estrutura real de
// `serv`/`valores`/`trib`, ver comentário em dps-builder.ts). Este
// teste documenta esse estado real (nunca finge que o builder já está
// completo) — é exatamente por isso que a transmissão real continua
// bloqueada (ver readiness.ts).
test("buildDpsXml ainda NÃO passa a validação XSD real (gap conhecido e documentado — ver dps-builder.ts)", async () => {
  const xml = buildDpsXml({
    issuer: { companyName: "INFORMATIVO REGIONAL LTDA", cnpj: "23970969000190", municipalRegistration: "1000546", ibgeCode: "4216404", municipality: "São João do Sul", state: "SC" },
    tomador: { sourceClientId: "client-1", kind: "individual", name: "Maria Souza", cpf: "11144477735", city: "São João do Sul", state: "SC" },
    fiscal: { cTribNac: "010101" },
    competencyDate: "2026-10-01",
    serviceValue: 150.5,
    serviceDescription: "Veiculação de anúncio publicitário",
    environment: "homologation",
    dpsSeries: "1",
    dpsNumber: 42,
  });
  const result = await validateDpsAgainstOfficialXsd(xml);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});
