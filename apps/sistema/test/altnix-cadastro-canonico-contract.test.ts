import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const at = (path: string) => readFileSync(new URL("../src/" + path, import.meta.url), "utf8");

test("Jornal IR conserva WhatsApp, telefones e papéis separados no cadastro mestre", () => {
  const form = at("features/clientes/ClientForm.tsx");
  const actions = at("app/sistema/clientes/actions.ts");
  const doc = readFileSync(
    new URL("../../../docs/ALTNIX-INFORMATIVO-CADASTRO-MESTRE-CONTRATO-20261116.md", import.meta.url),
    "utf8",
  );

  assert.match(form, /phonePrimary: client\?\.phonePrimary/);
  assert.match(form, /whatsapp: client\?\.whatsapp/);
  assert.match(form, /PhoneField value=\{payload\.phonePrimary\}/);
  assert.match(form, /PhoneField value=\{payload\.whatsapp\}/);
  assert.match(actions, /phonePrimary: payload\.phonePrimary/);
  assert.match(actions, /whatsapp: payload\.whatsapp/);
  assert.doesNotMatch(actions, /whatsapp:\s*payload\.phonePrimary/);

  assert.match(doc, /ad_clients\.jornalir_client_id/);
  assert.match(doc, /client_roles/);
  assert.match(doc, /ad_clients\.client_id/);
  assert.match(doc, /como fallback/i);
});
