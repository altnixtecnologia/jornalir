import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
