import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatEditorialDateTimeBR, isEditoriallyEdited } from "../src/components/site/date";

const published = "2026-11-18T19:00:00.000Z";

test("não anuncia edição em matéria nova, sem data editorial ou com dado inválido", () => {
  assert.equal(isEditoriallyEdited(published), false);
  assert.equal(isEditoriallyEdited(published, ""), false);
  assert.equal(isEditoriallyEdited(published, published), false);
  assert.equal(isEditoriallyEdited(published, "2026-11-17T19:00:00.000Z"), false);
  assert.equal(isEditoriallyEdited(published, "invalida"), false);
});

test("após edição editorial, mantém a publicação e identifica a última edição", () => {
  assert.equal(isEditoriallyEdited(published, "2026-11-19T12:00:00.000Z"), true);
});

test("datas e horários aparecem no fuso do Jornal (America/Sao_Paulo)", () => {
  assert.equal(formatEditorialDateTimeBR("2026-11-18T19:05:00.000Z"), "18/11/2026 às 16:05h");
  assert.equal(formatEditorialDateTimeBR("2026-11-19T02:07:00.000Z"), "18/11/2026 às 23:07h");
  assert.equal(formatEditorialDateTimeBR("inválida"), "");
});

test("o portal expõe a data real da edição e mostra a marca somente quando há edição", () => {
  const page = readFileSync(new URL("../src/app/(public)/noticias/[slug]/page.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../src/lib/public/publicContentService.ts", import.meta.url), "utf8");
  assert.match(page, /isEditoriallyEdited\(current\.publishedAt, current\.editedAt\)/);
  assert.match(page, /hasEditorialEdit && current\.editedAt/);
  assert.match(page, /Publicado em/);
  assert.match(page, /Editado em/);
  assert.match(page, /italic.*text-slate-400/);
  assert.match(page, /modifiedTime: article\.editedAt/);
  assert.match(service, /source_url, section_id, locality_id, urgent, published_at, editorial_edited_at/);
  assert.match(service, /editedAt: row\.editorial_edited_at \?\? undefined/);
  assert.doesNotMatch(service, /editedAt:\s*row\.updated_at/);
});

test("migração só registra alterações editoriais e não inventa datas anteriores", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20261122340400_article_editorial_edited_at.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists editorial_edited_at timestamptz/);
  assert.match(sql, /old\.status = 'published'/);
  assert.match(sql, /new\.status = 'published'/);
  assert.match(sql, /new\.body.*new\.source_url/s);
  assert.match(sql, /is distinct from/);
  assert.match(sql, /article_media_track_editorial_edit/);
  assert.match(sql, /where status = 'published'/);
  assert.doesNotMatch(sql, /update public\.articles\s+set editorial_edited_at = updated_at/i);
});
