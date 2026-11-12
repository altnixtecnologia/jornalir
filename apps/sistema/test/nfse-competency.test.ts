import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatLocalCompetencyDate, needsPreNovemberSimplesCompetencyReview } from "../src/lib/nfse/draftCompetency";

test("sugestao de competencia usa dia local e nao calendario UTC", () => {
  assert.equal(formatLocalCompetencyDate(new Date(2026, 10, 12, 23, 55)), "2026-11-12");
  assert.equal(formatLocalCompetencyDate(new Date(2026, 0, 1, 0, 5)), "2026-01-01");
});

test("aviso de retroatividade nao bloqueia e depende do enquadramento", () => {
  assert.equal(needsPreNovemberSimplesCompetencyReview({
    simplesNacionalOption: "me_epp", competencyDate: "2026-10-31",
  }), true);
  assert.equal(needsPreNovemberSimplesCompetencyReview({
    simplesNacionalOption: "me_epp", competencyDate: "2026-11-01",
  }), false);
  assert.equal(needsPreNovemberSimplesCompetencyReview({
    simplesNacionalOption: "non_optant", competencyDate: "2026-10-31",
  }), false);
  assert.equal(needsPreNovemberSimplesCompetencyReview({
    simplesNacionalOption: "me_epp", competencyDate: "invalid",
  }), false);
});

test("formulario fiscal nao sugere competencia a partir de UTC", () => {
  const source = readFileSync(new URL("../src/features/nfse/NfseDraftForm.tsx", import.meta.url), "utf8");
  assert.match(source, /formatLocalCompetencyDate\(new Date\(\)\)/);
  assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/);
});
