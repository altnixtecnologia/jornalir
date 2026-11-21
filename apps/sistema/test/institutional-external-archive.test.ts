import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isExternallyDraftedInstitutionalContract, withInstitutionalDocumentOrigin } from "../src/lib/contracts/externalInstitutionalArchive";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}
test("contratos existentes permanecem internos por padrão", () => {
  assert.equal(isExternallyDraftedInstitutionalContract({}), false);
  assert.equal(isExternallyDraftedInstitutionalContract({ extraData: { externallyDrafted: false } }), false);
  assert.equal(isExternallyDraftedInstitutionalContract({ extraData: { externallyDrafted: true } }), true);
});
test("a mudança de origem preserva os outros metadados da contratação", () => {
  const next = withInstitutionalDocumentOrigin({ composition: { services: ["led"] }, foo: 123 }, true);
  assert.deepEqual(next, { composition: { services: ["led"] }, foo: 123, externallyDrafted: true });
});
test("origem externa é cadastrada e editada, inclusive pelo wizard", () => {
  const form = source("../src/features/financeiro/ContractForm.tsx");
  const wizard = source("../src/features/financeiro/ContractIntakeWizard.tsx");
  const actions = source("../src/app/sistema/financeiro/contratos/actions.ts");
  assert.match(form, /checked=\{payload\.externallyDrafted\}/);
  assert.match(wizard, /externallyDrafted: false/);
  assert.match(actions, /withInstitutionalDocumentOrigin\(previous, payload\.externallyDrafted\)/);
  assert.match(actions, /service\.update\(id, toServiceInput\(payload, previous\.extraData\)\)/);
});
test("PDF externo exige contrato marcado, acesso de edição e guarda privada", () => {
  const actions = source("../src/app/sistema/financeiro/contratos/actions.ts");
  const section = actions.slice(actions.indexOf("export async function uploadExternalNotaryContractAction"), actions.indexOf("export interface ContractAmendmentFormInput"));
  assert.match(section, /checkFinanceAction\("contratos_editar"\)/);
  assert.match(section, /isExternallyDraftedInstitutionalContract\(contract\)/);
  assert.match(section, /uploadContractPdf\(supabase, contractId, file\)/);
  assert.match(section, /documentType: "contract"/);
  assert.doesNotMatch(section, /invitation|signInWithOtp|receivable|sendWhatsapp/);
});
test("contrato externo não oferece nem aceita geração de minutas ou assinatura eletrônica", () => {
  const detail = source("../src/app/sistema/financeiro/contratos/[id]/page.tsx");
  const generate = source("../src/app/sistema/financeiro/contratos/template-generation-actions.ts");
  const invites = source("../src/app/sistema/financeiro/contratos/signature-actions.ts");
  const company = source("../src/lib/signatures/companySigningServer.ts");
  assert.match(detail, /!externallyDrafted \? <ContractSignaturesPanel/);
  assert.match(detail, /!externallyDrafted \? <ContractTemplateGenerationPanel/);
  assert.equal((generate.match(/isExternallyDraftedInstitutionalContract\(contract\)/g) ?? []).length, 2);
  assert.equal((invites.match(/isExternallyDraftedInstitutionalContract\(contract\)/g) ?? []).length, 2);
  assert.match(company, /isExternallyDraftedInstitutionalContract\(\{ extraData: origin\.extra_data \}\)/);
});
