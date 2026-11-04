import test from "node:test";
import assert from "node:assert/strict";
import {
  previewInformativoAdvertiserLinks,
  type InformativoAdvertiserIdentity,
  type JornalMasterClientIdentity,
} from "../src/lib/integrations/altnixLinkPreview";

const advertiser: InformativoAdvertiserIdentity = {
  tenantId: "tenant-a", adClientId: "ad-1", document: "11.222.333/0001-81", mediaCount: 2,
};
const master: JornalMasterClientIdentity = {
  clientId: "ir-1", cpf: null, cnpj: "11222333000181",
};
const preview = (
  sources: InformativoAdvertiserIdentity[],
  clients: JornalMasterClientIdentity[] = [master],
  confirmed: { tenantId: string; adClientId: string; masterClientId: string }[] = [],
) => previewInformativoAdvertiserLinks(sources, clients, confirmed);

test("documento idêntico gera candidato, nunca vínculo automático", () => {
  assert.deepEqual(preview([advertiser])[0], {
    tenantId: "tenant-a", adClientId: "ad-1", mediaCount: 2,
    status: "candidate_only", masterClientId: "ir-1", reason: "candidate_exact_document",
  });
});

test("várias cidades/tenants podem sugerir o mesmo cadastro mestre", () => {
  const result = preview([advertiser, { ...advertiser, tenantId: "tenant-b", adClientId: "ad-2" }]);
  assert.deepEqual(result.map((row) => row.masterClientId), ["ir-1", "ir-1"]);
  assert.ok(result.every((row) => row.status === "candidate_only"));
});

test("sem documento não concilia por nome, e-mail ou telefone", () => {
  assert.equal(preview([{ ...advertiser, document: null }])[0].reason, "missing_or_invalid_document");
});

test("documento não encontrado exige revisão em vez de criar cliente", () => {
  assert.equal(preview([{ ...advertiser, document: "999.999.999-99" }])[0].reason, "no_master_document_match");
});

test("CPF/CNPJ duplicado no Jornal nunca escolhe cliente arbitrariamente", () => {
  const result = preview([advertiser], [master, { ...master, clientId: "ir-2" }])[0];
  assert.equal(result.status, "manual_review");
  assert.equal(result.reason, "ambiguous_master_document");
  assert.equal(result.masterClientId, null);
});

test("vínculo confirmado manualmente não autoriza operações, apenas aparece na prévia", () => {
  const result = preview([advertiser], [master], [
    { tenantId: "tenant-a", adClientId: "ad-1", masterClientId: "ir-1" },
  ])[0];
  assert.equal(result.status, "confirmed");
  assert.equal(result.reason, "confirmed_link");
});

test("vínculo ausente, divergente ou múltiplo exige revisão", () => {
  const link = { tenantId: "tenant-a", adClientId: "ad-1", masterClientId: "ir-2" };
  assert.equal(preview([advertiser], [master], [link])[0].reason, "confirmed_master_not_found");
  assert.equal(preview([advertiser], [master, {clientId: "ir-2", cpf: null, cnpj: "99888777000111"}], [link])[0].reason, "confirmed_document_mismatch");
  assert.equal(preview([advertiser], [master], [link, { ...link, masterClientId: "ir-1" }])[0].reason, "conflicting_confirmed_links");
});

test("registro repetido do mesmo anunciante não pode ser vinculado duas vezes", () => {
  assert.ok(preview([advertiser, advertiser]).every((row) => row.reason === "duplicate_source_record"));
});
