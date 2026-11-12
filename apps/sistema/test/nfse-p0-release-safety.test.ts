import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isRestrictedSefinEnvironment } from "../src/lib/nfse/restrictedSefinGate";

const source = (path: string) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("mutex fiscal usa service_role APENAS no servidor; liberacao nao pode falhar silenciosamente", () => {
  const repo = source("providers/supabase/nfseDraftRepository.supabase.ts");
  assert.match(repo, /const admin = createSupabaseAdminClient\(\)/);
  assert.match(repo, /admin\.rpc\("claim_draft_transmission"/);
  assert.match(repo, /admin\.rpc\("release_draft_transmission"/);
  assert.match(repo, /if \(error\) throw new Error\(`Nao foi possivel liberar a trava fiscal/);
  assert.doesNotMatch(repo, /client\.rpc\("claim_draft_transmission"/);
  assert.doesNotMatch(repo, /client\.rpc\("release_draft_transmission"/);
});

test("composicao fiscal oficial continua com provider que NAO transmite", () => {
  const composition = source("composition/nfse.ts");
  assert.match(composition, /new FetchNationalNfseProvider\(\)/);
  assert.doesNotMatch(composition, /new SefinNacionalNationalNfseProvider\(\)/);
});

test("edicao fiscal mantem permissionamento proprio e bloqueios preliminares", () => {
  const action = source("app/sistema/nfse/nova/actions.ts");
  assert.match(action, /checkModuleAction\("nfse", "rascunhos_editar"\)/);
  assert.match(action, /attempts\[0\]\?\.status === "pending"/);
  assert.match(action, /attempts\[0\]\?\.status === "uncertain"/);
});

test("SEFIN restrita so pode ser preparada em preview com banco segregado e flags duplas", () => {
  const good = {
    vercelEnv: "preview",
    restrictedEnabled: "true",
    homologationEnabled: "true",
    homologationProjectRef: "abcdefghijklmnopqrst",
    supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
  };
  assert.equal(isRestrictedSefinEnvironment(good), true);
  assert.equal(isRestrictedSefinEnvironment({ ...good, vercelEnv: "production" }), false);
  assert.equal(isRestrictedSefinEnvironment({ ...good, vercelEnv: undefined }), false);
  assert.equal(isRestrictedSefinEnvironment({ ...good, restrictedEnabled: "false" }), false);
  assert.equal(isRestrictedSefinEnvironment({ ...good, homologationEnabled: "false" }), false);
  assert.equal(isRestrictedSefinEnvironment({ ...good, homologationProjectRef: "outrorefabcdefghijkl" }), false);
  assert.equal(isRestrictedSefinEnvironment({ ...good, supabaseUrl: "https://example.com" }), false);
  assert.equal(isRestrictedSefinEnvironment({ ...good, supabaseUrl: "http://abcdefghijklmnopqrst.supabase.co" }), false);
  assert.equal(isRestrictedSefinEnvironment({ ...good, supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co.evil.com" }), false);
  assert.equal(isRestrictedSefinEnvironment({ ...good, supabaseUrl: "https://user:pass@abcdefghijklmnopqrst.supabase.co" }), false);
});

test("factory de mTLS esta isolada e NUNCA e importada pela composicao oficial", () => {
  const official = source("composition/nfse.ts");
  const restricted = source("composition/nfse-restricted.ts");
  assert.match(official, /new FetchNationalNfseProvider\(\)/);
  assert.doesNotMatch(official, /nfse-restricted|prepareRestrictedNfseTransmissionService/);
  assert.match(restricted, /assertRestrictedSefinEnvironment\(restrictedSefinEnvironmentFromServer\(\)\)/);
  assert.match(restricted, /environment !== "homologation"/);
  assert.match(restricted, /new SefinNacionalClient\(dispatcher\)/);
  assert.match(restricted, /await dispatcher\.close\(\)/);
  assert.match(restricted, /getActiveSigningMaterial\(issuer\.id\)/);
});
