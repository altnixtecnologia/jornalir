import test from "node:test";
import assert from "node:assert/strict";
import {
  loadCaptureDraftsForEdition,
  removeLastCaptureArea,
  saveCaptureRegionState,
  saveNewCaptureDraft,
  type VisualCaptureDraftDeps,
} from "../src/lib/editorial/visualCaptureDraft";
import type { CaptureDraftWithRegions } from "../src/providers/supabase/pdfCaptureRegions.supabase";

// Salvamento direto dos rascunhos da captura visual (pedido do usuário,
// 07/11/2026). Testes só com deps falsas — NUNCA tocam produção, nunca
// usam o edition_id real da 776/777 nem criam as seleções 29/30/31 (isso é
// reservado para o teste manual do usuário depois da publicação).

const EDITION_ID = "00000000-0000-4000-8000-000000000001";

function baseDeps(overrides: Partial<VisualCaptureDraftDeps> = {}): VisualCaptureDraftDeps {
  return {
    checkCreatePermission: async () => null,
    checkEditPermission: async () => null,
    checkArchivePermission: async () => null,
    createDraft: async () => ({ articleId: "article-1", updatedAt: "2026-11-07T10:00:00.000Z" }),
    saveState: async () => ({ applied: true, updatedAt: "2026-11-07T10:05:00.000Z" }),
    loadForEdition: async () => [],
    archiveDraft: async () => ({ ok: true }),
    ...overrides,
  };
}

const REGION = { page: 1, rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 } };

test("saveNewCaptureDraft: 403 quando falta permissão, sem chamar createDraft", async () => {
  let called = false;
  const result = await saveNewCaptureDraft(
    { editionId: EDITION_ID, page: 1, title: "T", subtitle: "", body: "B", clientCaptureId: "c1", regions: [REGION] },
    baseDeps({
      checkCreatePermission: async () => "Sem permissão.",
      createDraft: async () => {
        called = true;
        return { articleId: "x", updatedAt: "x" };
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "Sem permissão.");
  assert.equal(called, false);
});

test("saveNewCaptureDraft: sucesso devolve articleId/updatedAt", async () => {
  const result = await saveNewCaptureDraft(
    { editionId: EDITION_ID, page: 3, title: "Título", subtitle: "", body: "Corpo", clientCaptureId: "c1", regions: [REGION] },
    baseDeps(),
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.data, { articleId: "article-1", updatedAt: "2026-11-07T10:00:00.000Z" });
});

test("saveNewCaptureDraft: chamada repetida com o mesmo clientCaptureId é idempotente (a própria RPC devolve a mesma matéria — aqui só confirmamos que o mesmo input não quebra e sempre resulta em sucesso)", async () => {
  let calls = 0;
  const deps = baseDeps({
    createDraft: async (input) => {
      calls += 1;
      assert.equal(input.clientCaptureId, "c-fixo");
      return { articleId: "article-fixo", updatedAt: "2026-11-07T10:00:00.000Z" };
    },
  });
  const input = { editionId: EDITION_ID, page: 1, title: "T", subtitle: "", body: "B", clientCaptureId: "c-fixo", regions: [REGION] };
  const first = await saveNewCaptureDraft(input, deps);
  const second = await saveNewCaptureDraft(input, deps);
  assert.equal(calls, 2);
  if (first.ok && second.ok) assert.deepEqual(first.data, second.data);
});

test("saveNewCaptureDraft: erro do provider vira {ok:false,error}", async () => {
  const result = await saveNewCaptureDraft(
    { editionId: EDITION_ID, page: 1, title: "T", subtitle: "", body: "B", clientCaptureId: "c1", regions: [REGION] },
    baseDeps({ createDraft: async () => { throw new Error("falha de conexão simulada"); } }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "falha de conexão simulada");
});

test("saveCaptureRegionState: 403 quando falta permissão, sem chamar saveState", async () => {
  let called = false;
  const result = await saveCaptureRegionState(
    {
      articleId: "article-1",
      expectedUpdatedAt: "2026-11-07T10:00:00.000Z",
      title: "T",
      subtitle: "",
      body: "B",
      needsReview: false,
      regions: [REGION],
    },
    baseDeps({
      checkEditPermission: async () => "Sem permissão.",
      saveState: async () => {
        called = true;
        return { applied: true, updatedAt: "x" };
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(called, false);
});

test("saveCaptureRegionState: anexar trecho (2 áreas) persiste sort_order 0 e 1", async () => {
  let received: unknown;
  const result = await saveCaptureRegionState(
    {
      articleId: "article-1",
      expectedUpdatedAt: "2026-11-07T10:00:00.000Z",
      title: "T",
      subtitle: "",
      body: "B1\n\nB2",
      needsReview: false,
      regions: [
        { ...REGION, sortOrder: 0 },
        { page: 2, rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 }, sortOrder: 1 },
      ],
    },
    baseDeps({
      saveState: async (input) => {
        received = input.regions.map((r) => r.sortOrder);
        return { applied: true, updatedAt: "2026-11-07T10:06:00.000Z" };
      },
    }),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(received, [0, 1]);
});

test("saveCaptureRegionState: redimensionar/mover é a mesma primitiva (um region só, rect novo)", async () => {
  const result = await saveCaptureRegionState(
    {
      articleId: "article-1",
      expectedUpdatedAt: "2026-11-07T10:00:00.000Z",
      title: "T",
      subtitle: "",
      body: "Novo corpo recalculado",
      needsReview: false,
      regions: [{ page: 1, rect: { x: 0.2, y: 0.2, width: 0.5, height: 0.4 }, sortOrder: 0 }],
    },
    baseDeps(),
  );
  assert.equal(result.ok, true);
});

test("saveCaptureRegionState: remover uma área é enviar o array sem ela — função não distingue de um update normal", async () => {
  let regionCount = -1;
  const result = await saveCaptureRegionState(
    {
      articleId: "article-1",
      expectedUpdatedAt: "2026-11-07T10:00:00.000Z",
      title: "T",
      subtitle: "",
      body: "Só a área restante",
      needsReview: false,
      regions: [{ page: 1, rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 }, sortOrder: 0 }],
    },
    baseDeps({
      saveState: async (input) => {
        regionCount = input.regions.length;
        return { applied: true, updatedAt: "2026-11-07T10:07:00.000Z" };
      },
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(regionCount, 1);
});

test("saveCaptureRegionState: conflito de concorrência (applied=false) nunca é reportado como sucesso", async () => {
  const result = await saveCaptureRegionState(
    {
      articleId: "article-1",
      expectedUpdatedAt: "2026-11-07T10:00:00.000Z",
      title: "T",
      subtitle: "",
      body: "B",
      needsReview: false,
      regions: [REGION],
    },
    baseDeps({ saveState: async () => ({ applied: false, updatedAt: "2026-11-07T10:09:00.000Z" }) }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.conflict, true);
    assert.match(result.error, /outra sessão/);
  }
});

test("saveCaptureRegionState: múltiplas páginas na mesma matéria são aceitas sem transformação", async () => {
  let pages: number[] = [];
  const result = await saveCaptureRegionState(
    {
      articleId: "article-1",
      expectedUpdatedAt: "2026-11-07T10:00:00.000Z",
      title: "T",
      subtitle: "",
      body: "B",
      needsReview: false,
      regions: [
        { page: 5, rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 }, sortOrder: 0 },
        { page: 6, rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 }, sortOrder: 1 },
      ],
    },
    baseDeps({
      saveState: async (input) => {
        pages = input.regions.map((r) => r.page);
        return { applied: true, updatedAt: "2026-11-07T10:10:00.000Z" };
      },
    }),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(pages, [5, 6]);
});

test("saveCaptureRegionState: falha de conexão vira erro, nunca lança", async () => {
  const result = await saveCaptureRegionState(
    {
      articleId: "article-1",
      expectedUpdatedAt: "2026-11-07T10:00:00.000Z",
      title: "T",
      subtitle: "",
      body: "B",
      needsReview: false,
      regions: [REGION],
    },
    baseDeps({ saveState: async () => { throw new Error("ECONNRESET simulado"); } }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "ECONNRESET simulado");
});

test("loadCaptureDraftsForEdition: 403 quando falta permissão", async () => {
  const result = await loadCaptureDraftsForEdition(EDITION_ID, baseDeps({ checkEditPermission: async () => "Sem permissão." }));
  assert.equal(result.ok, false);
});

test("loadCaptureDraftsForEdition: devolve matérias com regiões ordenadas (retomada ao reabrir, inclui legado sem texto por região)", async () => {
  const drafts: CaptureDraftWithRegions[] = [
    {
      articleId: "legacy-1",
      title: "Matéria recuperada",
      subtitle: null,
      body: "Corpo já correto, vindo de articles.body",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      regions: [
        {
          page: 2,
          rect: { x: 0.05, y: 0.05, width: 0.4, height: 0.3 },
          sortOrder: 0,
          extractedTitle: null,
          extractedSubtitle: null,
          extractedBody: null,
          needsReview: false,
          warnings: [],
        },
      ],
    },
  ];
  const result = await loadCaptureDraftsForEdition(EDITION_ID, baseDeps({ loadForEdition: async () => drafts }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].body, "Corpo já correto, vindo de articles.body");
  }
});

test("removeLastCaptureArea: 403 quando falta permissão, sem chamar archiveDraft", async () => {
  let called = false;
  const result = await removeLastCaptureArea(
    "article-1",
    baseDeps({
      checkArchivePermission: async () => "Sem permissão.",
      archiveDraft: async () => {
        called = true;
        return { ok: true };
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(called, false);
});

test("removeLastCaptureArea: remover a última área ARQUIVA a matéria (nunca DELETE) — reaproveita o fluxo já existente", async () => {
  let archivedId: string | null = null;
  const result = await removeLastCaptureArea(
    "article-1",
    baseDeps({
      archiveDraft: async (id) => {
        archivedId = id;
        return { ok: true };
      },
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(archivedId, "article-1");
});

test("removeLastCaptureArea: erro do arquivamento é propagado", async () => {
  const result = await removeLastCaptureArea(
    "article-1",
    baseDeps({ archiveDraft: async () => ({ error: "Matéria publicada não pode ser removida pela listagem." }) }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /publicada/);
});

// --- Invariantes do cliente (PdfVisualCaptureModal.tsx), travadas no código-fonte ---
import { readFileSync } from "node:fs";
import { join } from "node:path";

const modalSource = readFileSync(join(__dirname, "../src/features/editorial/PdfVisualCaptureModal.tsx"), "utf8");

test("modal: o ÚNICO ponto que escreve no banco é saveAllDrafts (Server Actions de gravação só aparecem lá)", () => {
  for (const action of ["saveNewCaptureDraftAction", "saveCaptureRegionStateAction", "removeLastCaptureAreaAction"]) {
    const uses = modalSource.split(action).length - 1;
    assert.equal(uses, 2, `${action} deve aparecer só no import e dentro de saveAllDrafts`);
  }
  assert.match(modalSource, /async function saveAllDrafts/);
  assert.match(modalSource, /saveDraftsBatch\(pending, edition\.id/);
});

test("modal: selecionar, anexar, redimensionar, remover área e editar texto só marcam 'pendente' (markPending), sem gravar", () => {
  assert.match(modalSource, /markPending\(target\.id\)/);
  assert.match(modalSource, /markPending\(updatedCapture\.id\)/);
  assert.match(modalSource, /markPending\(captureId\)/);
  assert.match(modalSource, /saveStatus: "pending"/);
  assert.doesNotMatch(modalSource, /persistNewCapture|persistCaptureState|saveDebounceRef|saveChainRef/);
});

test("modal: botão 'Salvar rascunhos (N)' substitui a exportação JSON; sem downloads", () => {
  assert.match(modalSource, /Salvar rascunhos \(\$\{unsavedCount\}\)/);
  assert.match(modalSource, /Pendente de salvamento/);
  assert.doesNotMatch(modalSource, /Exportar|exportPreview|createObjectURL/);
  assert.doesNotMatch(modalSource, /prévia sem gravar|não grava rascunhos|salva automaticamente/i);
});

test("modal: clique duplo é ignorado enquanto salva e o botão fica desabilitado", () => {
  assert.match(modalSource, /if \(savingAllRef\.current \|\| busy\) return/);
  assert.match(modalSource, /disabled=\{unsavedCount === 0 \|\| savingAll \|\| busy\}/);
});

test("modal: matéria salva removida NÃO some em silêncio — fica marcada 'Será arquivada ao salvar' (pendingArchive)", () => {
  assert.match(modalSource, /pendingArchive: true/);
  assert.match(modalSource, /Será arquivada ao salvar/);
  assert.match(modalSource, /undoPendingArchive/);
});

test("modal: fechar só alerta com alterações não salvas e o descarte nunca apaga rascunhos do banco", () => {
  assert.match(modalSource, /Descartar alterações/);
  assert.match(modalSource, /Continuar editando/);
  assert.match(modalSource, /if \(hasPendingSave\) setCloseConfirm\(true\)/);
});

test("modal: nunca publica nem notifica (nenhuma ação de publicar/agendar/notificar)", () => {
  assert.doesNotMatch(modalSource, /publishNow|schedule|notificationMode|materias_publicar/);
});
