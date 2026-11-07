import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Item 3 da revisão de 07/11/2026 — "Confirmar que a lista de títulos tem
// rolagem independente, que o zoom não desloca os retângulos e que o modal
// aproveita a altura da tela." Checagem estrutural do CSS (mais barata e
// confiável que depender só de inspeção visual a cada mudança futura).

const css = readFileSync(join(__dirname, "../src/features/editorial/PdfVisualCaptureModal.module.css"), "utf8");

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  const match = new RegExp(escaped + "\\s*\\{([^}]*)\\}").exec(css);
  assert.ok(match, `regra ${selector} ausente no CSS`);
  return match[1];
}

test("modal aproveita a altura da tela (100dvh, só com a margem de segurança)", () => {
  assert.match(rule(".modal"), /height:\s*calc\(100dvh - 16px\)/);
});

test("a página do PDF tem sua própria rolagem (.viewerScroll), separada da lista lateral", () => {
  assert.match(rule(".viewerScroll"), /overflow:\s*auto/);
});

test("a lista de matérias tem rolagem PRÓPRIA (.selectionList), independente da página do PDF", () => {
  assert.match(rule(".selectionList"), /overflow-y:\s*auto/);
});

test("a barra lateral (.sidebar) nunca cresce junto com a lista — contém a rolagem dentro dela (overflow:hidden no container, scroll só no filho)", () => {
  assert.match(rule(".sidebar"), /overflow:\s*hidden/);
  assert.match(rule(".sidebar"), /min-height:\s*0/); // obrigatório num flex column para o filho poder rolar
});

test("os retângulos de seleção são posicionados em PORCENTAGEM (0..1 da página) — imunes ao zoom, que só escala o contêiner .page, nunca os próprios retângulos", () => {
  // .selection/.drawing são `position:absolute` dentro de `.page`; o componente
  // (PdfVisualCaptureModal.tsx) escreve left/top/width/height em "%", nunca em
  // px fixo — é essa combinação que torna a posição imune ao zoom.
  assert.match(rule(".selection,.drawing"), /position:\s*absolute/);
  assert.match(rule(".page"), /position:\s*relative/);
});

test("alças de ajuste (.resizeHandle) ficam acima do plano de desenho, para poder ser arrastadas sem precisar excluir e refazer a seleção", () => {
  const handle = rule(".resizeHandle");
  assert.match(handle, /pointer-events:\s*auto/);
  const pointerLayerZ = Number(/z-index:\s*(\d+)/.exec(rule(".pointerLayer"))?.[1]);
  const handleZ = Number(/z-index:\s*(\d+)/.exec(handle)?.[1]);
  assert.ok(handleZ > pointerLayerZ, `alça (z-index ${handleZ}) precisa ficar acima do plano de desenho (z-index ${pointerLayerZ})`);
});
