import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/features/agenda/AgendaWorkspace.tsx", import.meta.url),
  "utf8",
);

test("Agenda e Pauta: abas aparecem também dentro do sistema administrativo", () => {
  assert.match(source, /<div className="agenda-tabs" role="tablist" aria-label="Agenda e pauta">/);
  assert.doesNotMatch(source, /basePath === "\/agenda"\s*\?\s*<div className="agenda-tabs"/);
  assert.match(source, /data\.access\.agendaRead\s*\?\s*<button/);
  assert.match(source, /data\.access\.pautaRead\s*\?\s*<button/);
});

test("Agenda e Pauta: navegar no sistema usa as rotas existentes", () => {
  assert.match(source, /view === "pauta"\s*\? "\/sistema\/pauta"\s*:\s*"\/sistema\/agenda"/);
  assert.match(source, /navigate\("agenda", data\.focusDate\)/);
  assert.match(source, /navigate\("pauta", data\.focusDate\)/);
});
