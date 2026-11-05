import test from "node:test";
import assert from "node:assert/strict";
import {
  decideEditionArchiveAction,
  findAcervoObjectForEdition,
} from "../src/providers/r2/editionArchiveRecognition";
import { parseEditionArchiveObjectKey } from "../src/providers/r2/editionsArchiveImportPlan";

test("edição sem nada vinculado: sempre pode seguir para vincular (no_current_archive)", () => {
  const decision = decideEditionArchiveAction({
    currentPdfR2Key: null,
    currentPdfSha256: null,
    candidateKey: "acervo/edicoes/IR 776.pdf",
    candidateSha256: "abc",
  });
  assert.equal(decision, "no_current_archive");
});

test("edição já vinculada exatamente a este objeto: nada a fazer", () => {
  const decision = decideEditionArchiveAction({
    currentPdfR2Key: "acervo/edicoes/IR 776.pdf",
    currentPdfSha256: "abc",
    candidateKey: "acervo/edicoes/IR 776.pdf",
    candidateSha256: null,
  });
  assert.equal(decision, "same_object_already_linked");
});

test("mesmo conteúdo (SHA-256 igual) em chave diferente: reaproveitável sem novo upload", () => {
  const decision = decideEditionArchiveAction({
    currentPdfR2Key: "jornal-online/2026/edicao-0776/antigo.pdf",
    currentPdfSha256: "mesmohash",
    candidateKey: "acervo/edicoes/IR 776.pdf",
    candidateSha256: "MESMOHASH",
  });
  assert.equal(decision, "same_content_different_key");
});

test("conteúdo diferente (hash diverge) com algo já vinculado: exige decisão explícita, nunca decide por ETag/tamanho", () => {
  const decision = decideEditionArchiveAction({
    currentPdfR2Key: "jornal-online/2026/edicao-0776/antigo.pdf",
    currentPdfSha256: "hashvelho",
    candidateKey: "acervo/edicoes/IR 776.pdf",
    candidateSha256: "hashnovo",
  });
  assert.equal(decision, "conflict_requires_decision");
});

test("hash do candidato ainda não calculado (null): nunca presume igualdade — vai para conflito se já existe algo vinculado a outra chave", () => {
  const decision = decideEditionArchiveAction({
    currentPdfR2Key: "jornal-online/2026/edicao-0776/antigo.pdf",
    currentPdfSha256: "hashvelho",
    candidateKey: "acervo/edicoes/IR 776.pdf",
    candidateSha256: null,
  });
  assert.equal(decision, "conflict_requires_decision");
});

test("findAcervoObjectForEdition localiza o objeto do acervo para o número da edição, ignorando outros", () => {
  const objects = [
    { key: "acervo/edicoes/IR 775.pdf" },
    { key: "acervo/edicoes/IR 776.pdf" },
    { key: "acervo/edicoes/IR 0777.pdf" },
  ];
  const found = findAcervoObjectForEdition(objects, 776, parseEditionArchiveObjectKey);
  assert.equal(found?.key, "acervo/edicoes/IR 776.pdf");
});

test("findAcervoObjectForEdition devolve null quando não há objeto para o número pedido", () => {
  const objects = [{ key: "acervo/edicoes/IR 775.pdf" }];
  const found = findAcervoObjectForEdition(objects, 776, parseEditionArchiveObjectKey);
  assert.equal(found, null);
});
