import { test } from "node:test";
import assert from "node:assert/strict";
import { findSuspiciousCharacters, hasIsolatedLowercaseInUppercaseRun } from "../src/warnings";

test("hasIsolatedLowercaseInUppercaseRun: detecta o padrão real encontrado em edições do JornalIR", () => {
  assert.equal(hasIsolatedLowercaseInUppercaseRun("APRESEnTA"), true);
  assert.equal(hasIsolatedLowercaseInUppercaseRun("PROFESSOR MACK CITADIn VOLTA"), true);
  assert.equal(hasIsolatedLowercaseInUppercaseRun("EDUCAÇÃO DE PRAIA GRAnDE"), true);
  assert.equal(hasIsolatedLowercaseInUppercaseRun("O PRIMEIRO MÊS DE GOVERnO"), true);
});

test("hasIsolatedLowercaseInUppercaseRun: não dispara para texto normal em minúsculas/misto", () => {
  assert.equal(hasIsolatedLowercaseInUppercaseRun("A prefeitura confirmou nesta semana o início das obras."), false);
  assert.equal(hasIsolatedLowercaseInUppercaseRun("McDonald's é uma marca conhecida."), false);
  assert.equal(hasIsolatedLowercaseInUppercaseRun("O evento reuniu moradores e visitantes."), false);
});

test("hasIsolatedLowercaseInUppercaseRun: não dispara para maiúsculas corretas ou amostras curtas demais", () => {
  assert.equal(hasIsolatedLowercaseInUppercaseRun("TÍTULO CORRETO SEM PROBLEMA"), false);
  assert.equal(hasIsolatedLowercaseInUppercaseRun("PDFs"), false, "amostra com menos de 6 letras não é avaliada");
  assert.equal(hasIsolatedLowercaseInUppercaseRun(""), false);
});

test("findSuspiciousCharacters: continua detectando caractere de substituição e controle", () => {
  assert.deepEqual(findSuspiciousCharacters("texto normal"), []);
  assert.deepEqual(findSuspiciousCharacters("texto com � no meio"), ["caractere de substituição (�)"]);
  assert.deepEqual(findSuspiciousCharacters("textoestranho"), ["caractere de controle inesperado"]);
});
