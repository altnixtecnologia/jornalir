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

// Regressão real da produção 07/11/2026: o estilo global define button{
// height:36px}, fazendo os títulos de várias linhas vazarem para a linha
// seguinte na lista lateral. A classe do item precisa sobrescrever essa regra.
test("itens da lista crescem com o título, sem herdar height:36px do button global", () => {
  const item = rule(".listItemButton");
  assert.match(item, /height:\s*auto/);
  assert.match(item, /white-space:\s*normal/);
  assert.match(item, /min-height:\s*44px/);
});


test("mesmo botão adiciona trecho em um clique e volta ao normal após a seleção", () => {
  const button = rule(".editor .appendButton");
  assert.match(button, /height:\s*auto/);
  assert.match(button, /min-height:\s*36px/);
  assert.match(button, /white-space:\s*normal/);
  const active = rule(".editor .appendButton.appendActive");
  assert.match(active, /background:/);
});

test("mensagem de inclusão permite confirmação e erro sem depender do rodapé do modal", () => {
  assert.match(rule(".appendNotice"), /font-size:/);
  assert.match(rule(".appendNoticeSuccess"), /background:/);
  assert.match(rule(".appendNoticeError"), /background:/);
});

test("captura em modo incluir trecho não intercepta arrasto para mover área anterior", () => {
  const component = readFileSync(join(__dirname, "../src/features/editorial/PdfVisualCaptureModal.tsx"), "utf8");
  assert.match(component, /capture\.id === selectedId && appendToId === null/);
  assert.match(component, /appendRegionToCapture\(capture, area, extraction\)/);
  assert.match(component, /setAppendNotice\(\{/);
  assert.match(component, /setAppendToId\(null\)/);
});


test("o X de cada retângulo fica clicável acima do plano de desenho, sem bloquear a página", () => {
  const button = rule(".selectionRemove");
  assert.match(button, /pointer-events:\s*auto/);
  assert.match(button, /height:\s*24px/);
  assert.match(button, /z-index:\s*8/);
  const selection = rule(".selection");
  assert.match(selection, /z-index:\s*4/);
  assert.match(rule(".pointerLayer"), /z-index:\s*3/);
});

test("o X só remove uma área e confirma antes de apagar a última", () => {
  const component = readFileSync(join(__dirname, "../src/features/editorial/PdfVisualCaptureModal.tsx"), "utf8");
  assert.match(component, /removeAreaFromCapture\(capture, areaIndex\)/);
  assert.match(component, /capture\.areas\.length === 1/);
  assert.match(component, /setPendingAreaDeletion\(\{ captureId, areaIndex \}\)/);
  assert.match(component, /requestRemoveArea\(capture\.id, areaIndex\)/);
  assert.match(component, /appendToId === null \? \(/);
  assert.match(component, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
});

test("após concluir seleção adicional a ferramenta encerra o modo automaticamente", () => {
  const component = readFileSync(join(__dirname, "../src/features/editorial/PdfVisualCaptureModal.tsx"), "utf8");
  assert.match(component, /setAppendToId\(null\);\s*setAppendNotice\(\{/);
  assert.match(component, /\+ Incluir outro trecho nesta matéria/);
});


test("confirmação de saída distingue continuar editando e descarte sem bloquear leitura", () => {
  const actions = rule(".confirmBox>.confirmActions");
  assert.match(actions, /grid-template-columns:\s*1fr 1fr/);
  const safe = rule(".confirmBox>.confirmActions>.keepEditingButton");
  const destructive = rule(".confirmBox>.confirmActions>.discardPreviewButton");
  assert.match(safe, /background:\s*#1d4ed8/);
  assert.match(destructive, /background:\s*#fff/);
  const component = readFileSync(join(__dirname, "../src/features/editorial/PdfVisualCaptureModal.tsx"), "utf8");
  // Salvamento direto dos rascunhos (07/11/2026): a confirmação só aparece
  // quando há matéria salvando/com erro — não há mais "seleção não salva"
  // a perder, por isso o texto mudou de "Fechar sem salvar" para refletir
  // o estado real (ver hasPendingSave).
  assert.match(component, /Fechar mesmo assim\?/);
  assert.match(component, /Continuar editando/);
  assert.match(component, /Fechar mesmo assim/);
});
