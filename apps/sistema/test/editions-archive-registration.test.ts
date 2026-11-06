import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  archiveAvailableAtIso,
  buildArchiveRegistrationSql,
  isValidIsoDate,
  needsDateReview,
  parseArchiveDatesCsv,
  sqlLiteral,
} from "../src/providers/r2/editionsArchiveRegistration";

const CSV = [
  "edition_number,r2_key,date_iso,status_final,origem_da_confirmacao,weekday_extracted,weekday_matches_calendar,evidence_snippet,observacao",
  '248,acervo/edicoes/IR 248.pdf,2016-08-19,confirmada,automatica_masthead_dateline,sexta-feira,true,"São João do Sul, sexta-feira, 19 de agosto de 2016",',
  '340,acervo/edicoes/IR 340.pdf,2018-06-07,revisado_manualmente_divergencia_nao_resolvida_com_certeza,revisao_manual,,,"",nota',
  "341,acervo/edicoes/IR 341.pdf,2018-02-31,confirmada,automatica_masthead_dateline,,,,",
].join("\n");

const ITEM = {
  editionNumber: 500,
  pdfKey: "acervo/edicoes/IR 500.pdf",
  pdfSize: 8_000_000,
  dateIso: "2021-07-22",
  coverKey: "jornal-online/2021/edicao-0500/capa-abc.webp",
};

test("lê o relatório de datas, aceita só datas de calendário reais e marca as não confirmadas para conferência", () => {
  const records = parseArchiveDatesCsv(CSV);
  assert.equal(records.get(248)?.dateIso, "2016-08-19");
  assert.equal(needsDateReview(records.get(248)!), false);
  assert.equal(records.get(340)?.dateIso, "2018-06-07");
  assert.equal(needsDateReview(records.get(340)!), true);
  assert.equal(records.get(341)?.dateIso, null, "31/02 não existe: nunca vira data");
  assert.equal(isValidIsoDate("2016-08-19"), true);
  assert.equal(isValidIsoDate("19/08/2016"), false);
  assert.equal(archiveAvailableAtIso("2016-08-19"), "2016-08-19T10:00:00.000Z");
});

test("SQL cria fichas publicadas, sem notificação, fora da fila de matérias, sem sobrescrever existentes", () => {
  const sql = buildArchiveRegistrationSql([ITEM], "Maria", new Date("2026-11-06T12:00:00Z"));
  assert.match(sql, /\(500, date '2021-07-22', 'Edição 500', 'acervo\/edicoes\/IR 500\.pdf', 'IR 500\.pdf', 8000000::bigint, 'jornal-online\/2021\/edicao-0500\/capa-abc\.webp', timestamptz '2021-07-22T10:00:00\.000Z'\)/);
  assert.match(sql, /i\.cover_r2_key, true, 'available', i\.available_at, 'skipped', null,/);
  assert.match(sql, /on conflict \(edition_number\) do nothing/);
  assert.match(sql, /raise exception 'Executor não corresponde a exatamente 1 perfil ativo/);
  assert.match(sql, /'edition_archive_registered'/);
  assert.doesNotMatch(sql, /notification_events|\bupdate\s+public\.|\bdelete\s+from/i);
});

test("SQL escapa aspas e recusa data inválida", () => {
  assert.equal(sqlLiteral("O'Brien"), "'O''Brien'");
  const sql = buildArchiveRegistrationSql([ITEM], "D'Ávila", new Date());
  assert.match(sql, /lower\('D''Ávila'\)/);
  assert.throws(() => buildArchiveRegistrationSql([{ ...ITEM, dateIso: "2021-02-30" }], "Maria", new Date()));
  assert.throws(() => buildArchiveRegistrationSql([], "Maria", new Date()));
});

test("script só lê por padrão, exige --actor para gerar o SQL e nunca apaga nem notifica", () => {
  const source = readFileSync(new URL("../scripts/import-editions-archive.ts", import.meta.url), "utf8");
  assert.match(source, /if \(!uploadCovers && !actorName\) throw/);
  assert.match(source, /existing\.has\(editionNumber\)\) skipped\.push\(\{ editionNumber, reason: "ja_cadastrada" \}\)/);
  assert.match(source, /if \(result\.key !== item\.coverKey\) throw/);
  assert.doesNotMatch(source, /\.insert\(|\.upsert\(|\.update\(|\.delete\(|deleteEditionArchiveObject|notification_events/);
});
