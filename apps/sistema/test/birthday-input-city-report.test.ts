import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  maskBirthdayDayMonthInput, parseBirthdayDateInput,
} from "../src/features/aniversariantes/birthdayDateInput";
import {
  ibgeMunicipalityLabel, matchMunicipalities, municipalityLabels,
  normalizeMunicipalitySearch,
} from "../src/features/aniversariantes/municipalityAutocomplete";
import { birthdayReportToTSV } from "../src/features/aniversariantes/birthdayReport";
import { dayIndexWithinRange } from "../src/features/aniversariantes/birthdayTypes";

const src = (path: string) => readFileSync(new URL("../src/" + path, import.meta.url), "utf8");

test("Aniversariantes: digitar 0107 gera 01/07 automaticamente", () => {
  assert.equal(maskBirthdayDayMonthInput("0"), "0");
  assert.equal(maskBirthdayDayMonthInput("01"), "01");
  assert.equal(maskBirthdayDayMonthInput("010"), "01/0");
  assert.equal(maskBirthdayDayMonthInput("0107"), "01/07");
  assert.equal(maskBirthdayDayMonthInput("01/07"), "01/07");
  assert.equal(maskBirthdayDayMonthInput("01072026"), "01/07");
  assert.equal(maskBirthdayDayMonthInput(""), "");
  assert.deepEqual(parseBirthdayDateInput(maskBirthdayDayMonthInput("0107"), ""), {
    birthDate: "2000-07-01", birthYearKnown: false,
  });
  assert.equal(parseBirthdayDateInput(maskBirthdayDayMonthInput("3102"), ""), null);
});

test("Municípios: interpreta os dois formatos da API oficial de Localidades do IBGE", () => {
  const flat = { "municipio-nome": "São João do Sul", "UF-sigla": "SC" };
  const nested = { nome: "Bom Jesus", microrregiao: { mesorregiao: { UF: { sigla: "RS" } } } };
  const newShape = {
    nome: "Florianópolis",
    "regiao-imediata": { "regiao-intermediaria": { UF: { sigla: "SC" } } },
  };
  assert.equal(ibgeMunicipalityLabel(flat), "São João do Sul - SC");
  assert.equal(ibgeMunicipalityLabel(nested), "Bom Jesus - RS");
  assert.equal(ibgeMunicipalityLabel(newShape), "Florianópolis - SC");
  assert.equal(ibgeMunicipalityLabel({ nome: "Cidade desconhecida" }), null);
  assert.equal(ibgeMunicipalityLabel({ nome: "Cidade", "UF-sigla": "??" }), null);
});

test("Municípios: autocompleta por prefixo sem acentos, preserva UF e nomes homônimos", () => {
  const values = municipalityLabels([
    { "municipio-nome": "São João do Sul", "UF-sigla": "SC" },
    { nome: "São José", microrregiao: { mesorregiao: { UF: { sigla: "SC" } } } },
    { nome: "Bom Jesus", microrregiao: { mesorregiao: { UF: { sigla: "RS" } } } },
    { "municipio-nome": "Bom Jesus", "UF-sigla": "SC" },
    { "municipio-nome": "São João do Sul", "UF-sigla": "SC" },
  ]);
  assert.equal(values.length, 4);
  assert.equal(normalizeMunicipalitySearch("São João"), "sao joao");
  assert.deepEqual(matchMunicipalities(values, "sao jo", 5), [
    "São João do Sul - SC", "São José - SC",
  ]);
  assert.deepEqual(matchMunicipalities(values, "bom jesus", 5), [
    "Bom Jesus - RS", "Bom Jesus - SC",
  ]);
  assert.deepEqual(matchMunicipalities(values, "", 5), []);
});

test("Relatório InDesign: exclusivamente Data TAB Nome TAB Cidade, sem título, dia ou mensagem", () => {
  const date = new Date(2026, 10, 12);
  const end = new Date(2026, 10, 18);
  assert.equal(dayIndexWithinRange("2000-11-12", date, end), 0);
  assert.equal(dayIndexWithinRange("2000-11-18", date, end), 6);
  const rows = [
    { birthDate: "2000-11-12", displayName: "Ana Exemplo", city: "São João do Sul - SC" },
    { birthDate: "2000-11-14", displayName: "Bruno Exemplo", city: "Sombrio - SC" },
  ];
  assert.equal(
    birthdayReportToTSV(rows),
    "12/11\tAna Exemplo\tSão João do Sul - SC\n14/11\tBruno Exemplo\tSombrio - SC",
  );
  assert.equal(birthdayReportToTSV([]), "");
});

test("Integração: máscara, autocomplete e tabela usados nos três formulários e no relatório", () => {
  const list = src("features/aniversariantes/BirthdaysList.tsx");
  const city = src("features/aniversariantes/BirthdayCityAutocomplete.tsx");
  const route = src("app/api/localidades/municipios/route.ts");
  const css = src("features/aniversariantes/BirthdaysList.module.css");
  const globalCss = src("app/globals.css");
  assert.equal((list.match(/maskBirthdayDayMonthInput\(e\.target\.value\)/g) ?? []).length, 3);
  assert.equal((list.match(/<BirthdayCityAutocomplete/g) ?? []).length, 3);
  assert.match(list, /const text = birthdayReportToTSV\(reportRows\)/);
  assert.match(list, /entry\.active && item\.entry\.publishInPrint/);
  assert.match(list, /a\.dayIndex !== b\.dayIndex \? a\.dayIndex - b\.dayIndex/);
  assert.match(route, /servicodados\.ibge\.gov\.br/);
  assert.match(route, /revalidate: 604800/);
  assert.match(city, /role="combobox"/);
  assert.match(city, /role="listbox"/);
  assert.match(city, /onPointerDown/);
  assert.match(css, /birthday-city-suggestions/);
  assert.match(globalCss, /\.aniv-print-table/);
  assert.match(list, /<div className="aniv-print-report">/);
});
