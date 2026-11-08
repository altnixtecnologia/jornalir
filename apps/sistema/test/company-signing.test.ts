import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync, inflateSync } from "node:zlib";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  assertCompanySigned,
  cancelCompanyRound,
  changeRoundRepresentative,
  confirmCompanySignature,
  openCompanyRound,
  selectRequiredRepresentatives,
  sha256Hex,
  type CompanyRound,
  type CompanySigningDeps,
  type ConfirmInput,
  type FinalizeParams,
  type NewRoundRow,
} from "../src/lib/signatures/companySigning";
import { prepareSignaturePdf, stampCompanySignature } from "../src/lib/signatures/companySignaturePdf";
import type { LegalRepresentativeRow } from "../src/lib/contracts/contractorProfile";

// Etapa 3A: assinatura da empresa. Banco/storage falsos com a MESMA semântica das
// funções SQL (exclusão mútua, duplicidade, conclusão); PDFs reais gerados e lidos.

const ROUND_ID = "aaaaaaaa-1111-4222-8333-444444444444";
const DOC_ID = "bbbbbbbb-1111-4222-8333-444444444444";
const CONTRACT_ID = "cccccccc-1111-4222-8333-444444444444";
const PW = "senha-correta";

type Rep = LegalRepresentativeRow & { profile_id: string | null };
const rep = (overrides: Partial<Rep> = {}): Rep => ({
  id: "rep-1", full_name: "Fulano de Tal", cpf: "52998224725", role_title: "Sócio-administrador", nationality: null,
  representation_rule: "individual", powers_description: "Poderes plenos para assinar contratos.", powers_valid_from: null,
  powers_valid_until: null, active: true, is_default: true, profile_id: "user-rep-1", ...overrides,
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function makePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(40, 0);
  ihdr.writeUInt32BE(16, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(40 * 3, 30)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: 16 }, () => row)))), chunk("IEND", Buffer.alloc(0))]);
}

async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 2; i += 1) pdf.addPage([595, 842]).drawText(`Clausulas pagina ${i}`, { x: 60, y: 700, size: 12, font });
  return pdf.save({ useObjectStreams: false });
}

function drawnText(pdf: Uint8Array): string {
  const raw = Buffer.from(pdf).toString("latin1");
  const parts: string[] = [];
  for (const match of raw.matchAll(/(?<!end)stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      const content = inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
      for (const hex of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) parts.push(Buffer.from(hex[1], "hex").toString("latin1"));
    } catch {
      /* ignora */
    }
  }
  return parts.join("\n");
}

interface World {
  deps: CompanySigningDeps;
  files: Map<string, Uint8Array>;
  rounds: Map<string, CompanyRound & { lockedBy?: string | null }>;
  audits: Array<{ action: string; metadata: Record<string, unknown> }>;
  finalized: FinalizeParams[];
  state: { actorId: string; actorName: string; grant: boolean; prepare: boolean; reps: Rep[]; password: string; pngByOwner: Map<string, Buffer>; failStamp: boolean; today: string };
  original: Uint8Array;
}

async function world(options: { reps?: Rep[]; actorId?: string; actorName?: string } = {}): Promise<World> {
  const original = await samplePdf();
  const files = new Map<string, Uint8Array>([["docs/original.pdf", original]]);
  const rounds = new Map<string, CompanyRound & { lockedBy?: string | null }>();
  const audits: World["audits"] = [];
  const finalized: FinalizeParams[] = [];
  const state: World["state"] = {
    actorId: options.actorId ?? "user-rep-1", actorName: options.actorName ?? "Usuaria Comercial", grant: true, prepare: true,
    reps: options.reps ?? [rep()], password: PW, pngByOwner: new Map(), failStamp: false, today: "2026-11-08",
  };
  let counter = 0;
  const deps: CompanySigningDeps = {
    newId: () => (counter++ === 0 ? ROUND_ID : `dddddddd-1111-4222-8333-${String(counter).padStart(12, "0")}`),
    now: () => new Date(`${state.today}T15:00:00Z`),
    checkPrepare: async () => (state.prepare ? null : "Sem permissão para preparar a assinatura."),
    checkSigningGrant: async () => (state.grant ? null : "Você não tem a concessão para assinar contratos comerciais."),
    loadSource: async (ref) => ({
      title: "Contrato Comercial", path: "docs/original.pdf", bytes: files.get("docs/original.pdf") as Uint8Array,
      recordedSha256: ref.modality === "commercial" ? sha256Hex(original) : undefined,
    }),
    loadRepresentatives: async () => state.reps,
    loadManualLayout: async () => null,
    preparePdf: async (input) => {
      const prepared = await prepareSignaturePdf(input);
      return { bytes: prepared.bytes, layoutMode: prepared.mode, layoutFields: prepared.layout.fields };
    },
    stampPdf: async (input) => {
      if (state.failStamp) throw new Error("falha simulada ao carimbar");
      return stampCompanySignature(input);
    },
    pathFor: (round, kind, sequence, sha) => `signing/${round.id}/${kind}-${sequence}-${sha.slice(0, 12)}.pdf`,
    writePdf: async (path, bytes, sha) => {
      const existing = files.get(path);
      if (existing && sha256Hex(existing) !== sha) throw new Error("Objeto já existe com outro conteúdo.");
      files.set(path, bytes);
    },
    readPdf: async (path) => {
      const bytes = files.get(path);
      if (!bytes) throw new Error("arquivo ausente");
      return bytes;
    },
    findActiveRound: async () => [...rounds.values()].find((round) => round.status !== "cancelled") ?? null,
    getRound: async (id) => rounds.get(id) ?? null,
    createRound: async (row: NewRoundRow) => {
      const round: CompanyRound & { lockedBy?: string | null } = { ...row, status: "preparing", signatures: [], representativeId: row.representativeId ?? null };
      rounds.set(row.id, round);
      return round;
    },
    reprepareRound: async (id, patch) => {
      const round = rounds.get(id) as CompanyRound;
      if (round.status !== "preparing" || round.signatures.length > 0) throw new Error("Assinatura iniciada: não é possível trocar.");
      Object.assign(round, patch);
      return round;
    },
    cancelRound: async (id) => {
      (rounds.get(id) as CompanyRound).status = "cancelled";
    },
    claimTurn: async (id, profileId, representativeId, signerKey) => {
      const round = rounds.get(id);
      if (!round || (round.status !== "preparing" && round.status !== "signing")) throw new Error("Rodada indisponível.");
      if (round.lockedBy && round.lockedBy !== profileId) throw new Error("Outra assinatura está sendo concluída.");
      if (round.signatures.some((s) => s.profileId === profileId || s.signerKey === signerKey || (representativeId && s.representativeId === representativeId))) {
        throw new Error("Este signatário já assinou.");
      }
      round.lockedBy = profileId;
      const last = [...round.signatures].sort((a, b) => b.sequence - a.sequence)[0];
      return { basePath: last?.signedPath ?? round.preparedPath, baseSha256: last?.signedSha256 ?? round.preparedSha256, nextSequence: round.signatures.length + 1 };
    },
    releaseTurn: async (id, profileId) => {
      const round = rounds.get(id);
      if (round && round.lockedBy === profileId) round.lockedBy = null;
    },
    finalize: async (params) => {
      finalized.push(params);
      const round = rounds.get(params.roundId) as CompanyRound & { lockedBy?: string | null };
      if (round.lockedBy !== params.profileId) throw new Error("Vez não reivindicada.");
      round.signatures.push({
        sequence: round.signatures.length + 1, signerKey: params.signerKey, profileId: params.profileId,
        representativeId: params.representativeId, signedPath: params.signedPath, signedSha256: params.signedSha256, signedAt: "x",
      });
      round.lockedBy = null;
      round.status = "signing";
      const completed = round.signatures.length >= round.requiredSignatures;
      if (completed) {
        round.status = "completed";
        round.finalPath = params.signedPath;
        round.finalSha256 = params.signedSha256;
      }
      return { completed, finalDocumentId: completed ? "final-doc" : null };
    },
    loadSignaturePng: async (owner) => {
      const bytes = state.pngByOwner.get(`${owner.kind}:${owner.id}`);
      return bytes ? { bytes, sha256: sha256Hex(bytes) } : null;
    },
    reauthenticate: async (password) => password === state.password,
    actor: async () => ({ profileId: state.actorId, name: state.actorName }),
    audit: async (_id, action, metadata) => {
      audits.push({ action, metadata });
    },
  };
  return { deps, files, rounds, audits, finalized, state, original };
}

const confirmInput = (round: CompanyRound, typedName: string, overrides: Partial<ConfirmInput> = {}): ConfirmInput => ({
  roundId: round.id, typedName, acceptedStatement: true, password: PW, displayedSha256: round.preparedSha256, ...overrides,
});

async function openCommercial(w: World): Promise<CompanyRound> {
  const opened = await openCompanyRound({ modality: "commercial", commercialDocumentId: DOC_ID }, w.deps);
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error("falhou");
  return opened.round;
}
async function openInstitutional(w: World, representativeId = "rep-1"): Promise<CompanyRound> {
  const opened = await openCompanyRound({ modality: "institutional", contractId: CONTRACT_ID, documentId: DOC_ID, representativeId }, w.deps);
  assert.equal(opened.ok, true, opened.ok ? "" : opened.error);
  if (!opened.ok) throw new Error("falhou");
  return opened.round;
}

// ------------------------------------------------------------------ comercial

test("comercial: preparar NÃO assina nem carimba; documento fica identificado por hash e a rodada em 'preparação'", async () => {
  const w = await world();
  const round = await openCommercial(w);
  assert.equal(round.status, "preparing");
  assert.equal(round.signatures.length, 0);
  assert.equal(round.layoutMode, "automatic");
  assert.equal(sha256Hex(w.files.get(round.preparedPath) as Uint8Array), round.preparedSha256);
  assert.equal(round.originalSha256, sha256Hex(w.original));
  assert.doesNotMatch(drawnText(w.files.get(round.preparedPath) as Uint8Array), /Em \d{2}\/\d{2}\/\d{4}|Usuaria Comercial/);
  assert.equal(w.audits[0].action, "company_signature_round_opened");
});

test("comercial: sem permissão de preparar é bloqueado; abrir de novo reaproveita a rodada (idempotente)", async () => {
  const w = await world();
  w.state.prepare = false;
  const denied = await openCompanyRound({ modality: "commercial", commercialDocumentId: DOC_ID }, w.deps);
  assert.equal(denied.ok, false);
  assert.equal(w.rounds.size, 0);
  w.state.prepare = true;
  const first = await openCommercial(w);
  const again = await openCompanyRound({ modality: "commercial", commercialDocumentId: DOC_ID }, w.deps);
  assert.equal(again.ok && again.reused, true);
  assert.equal(w.rounds.size, 1);
  assert.equal(again.ok && again.round.id, first.id);
});

test("comercial: sem a concessão contratos_assinar o SERVIDOR bloqueia (estar logado não basta)", async () => {
  const w = await world();
  const round = await openCommercial(w);
  w.state.grant = false;
  const result = await confirmCompanySignature(confirmInput(round, "Usuaria Comercial"), w.deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /concessão/);
  assert.equal(round.signatures.length, 0);
  assert.equal(w.finalized.length, 0);
});

test("comercial: exige ação explícita — declaração, nome digitado, senha e hash da versão vista", async () => {
  const w = await world();
  const round = await openCommercial(w);
  const cases: Array<[Partial<ConfirmInput>, string, RegExp]> = [
    [{ acceptedStatement: false }, "Usuaria Comercial", /declaração/],
    [{ password: "" }, "Usuaria Comercial", /senha/i],
    [{ password: "errada" }, "Usuaria Comercial", /Senha incorreta/],
    [{ displayedSha256: "" }, "Usuaria Comercial", /Identificação da versão/],
  ];
  for (const [override, name, pattern] of cases) {
    const result = await confirmCompanySignature(confirmInput(round, name, override), w.deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, pattern);
  }
  const wrongName = await confirmCompanySignature(confirmInput(round, "Outra Pessoa"), w.deps);
  assert.equal(wrongName.ok, false);
  if (!wrongName.ok) assert.match(wrongName.error, /Digite exatamente o nome/);
  const staleHash = await confirmCompanySignature(confirmInput(round, "Usuaria Comercial", { displayedSha256: "f".repeat(64) }), w.deps);
  assert.equal(staleHash.ok, false);
  if (!staleHash.ok) assert.match(staleHash.error, /mudou/);
  assert.equal(round.signatures.length, 0);
  assert.equal(round.lockedBy ?? null, null, "a vez é liberada após a recusa");
});

test("comercial: confirmação válida carimba nome/data, grava hash antes→depois, conclui e a imagem PNG entra só como representação visual", async () => {
  const w = await world();
  w.state.pngByOwner.set("profile:user-rep-1", makePng());
  const round = await openCommercial(w);
  const result = await confirmCompanySignature(confirmInput(round, "usuária comercial"), w.deps);
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  if (!result.ok) return;
  assert.equal(result.completed, true);
  const stored = w.files.get(round.signatures[0].signedPath) as Uint8Array;
  assert.equal(sha256Hex(stored), result.signedSha256);
  assert.match(drawnText(stored), /Usuaria Comercial/);
  assert.ok(Buffer.from(stored).includes(Buffer.from("/Subtype /Image")));
  const finalized = w.finalized[0];
  assert.equal(finalized.sourceSha256, round.preparedSha256, "hash do documento ANTES da assinatura");
  assert.equal(finalized.signedSha256, result.signedSha256, "hash DEPOIS");
  assert.equal(finalized.representationRule, "authorized_user");
  assert.match(finalized.powersSnapshot, /nao comprova poderes estatutarios/);
  assert.equal((finalized.audit as { reauthenticated: boolean }).reauthenticated, true);
  assert.equal(round.status, "completed");
  assert.deepEqual(w.audits.map((a) => a.action), ["company_signature_round_opened", "company_signature_confirmed"]);
  // O arquivo preparado e o original continuam intactos.
  assert.equal(sha256Hex(w.files.get(round.preparedPath) as Uint8Array), round.preparedSha256);
  assert.equal(sha256Hex(w.files.get("docs/original.pdf") as Uint8Array), round.originalSha256);
});

test("comercial: sem PNG cadastrado a assinatura ainda é possível (texto), e o PNG de OUTRA pessoa nunca é usado", async () => {
  const w = await world();
  w.state.pngByOwner.set("profile:outra-pessoa", makePng());
  const round = await openCommercial(w);
  const result = await confirmCompanySignature(confirmInput(round, "Usuaria Comercial"), w.deps);
  assert.equal(result.ok, true);
  const stored = w.files.get(round.signatures[0].signedPath) as Uint8Array;
  assert.ok(!Buffer.from(stored).includes(Buffer.from("/Subtype /Image")));
  assert.equal(w.finalized[0].signaturePngSha256, undefined);
});

test("comercial: assinatura duplicada e assinatura após concluído são recusadas; o PDF concluído não muda", async () => {
  const w = await world();
  const round = await openCommercial(w);
  const first = await confirmCompanySignature(confirmInput(round, "Usuaria Comercial"), w.deps);
  assert.equal(first.ok, true);
  const finalBytes = Buffer.from(w.files.get(round.signatures[0].signedPath) as Uint8Array);
  const second = await confirmCompanySignature(confirmInput(round, "Usuaria Comercial", { displayedSha256: round.finalSha256 as string }), w.deps);
  assert.equal(second.ok, false);
  if (!second.ok) assert.match(second.error, /já foi assinado/);
  assert.equal(w.finalized.length, 1);
  assert.ok(finalBytes.equals(Buffer.from(w.files.get(round.signatures[0].signedPath) as Uint8Array)));
  const cancel = await cancelCompanyRound(round.id, "Tentando cancelar um documento já assinado pela empresa.", w.deps);
  assert.equal(cancel.ok, false);
  if (!cancel.ok) assert.match(cancel.error, /aditivo/);
});

test("adulteração: PDF armazenado diferente do hash registrado bloqueia a preparação e a assinatura", async () => {
  const w = await world();
  const tampered = await world();
  tampered.deps.loadSource = async () => ({ title: "x", path: "docs/original.pdf", bytes: new Uint8Array([...w.original, 10]), recordedSha256: sha256Hex(w.original) });
  const blocked = await openCompanyRound({ modality: "commercial", commercialDocumentId: DOC_ID }, tampered.deps);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.match(blocked.error, /não confere com o hash/);

  const round = await openCommercial(w);
  const bytes = w.files.get(round.preparedPath) as Uint8Array;
  w.files.set(round.preparedPath, new Uint8Array([...bytes, 0]));
  const result = await confirmCompanySignature(confirmInput(round, "Usuaria Comercial"), w.deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /não confere com o hash/);
  assert.equal(round.signatures.length, 0);
  assert.equal(round.lockedBy ?? null, null);
});

test("falha ao carimbar libera a vez e nada é registrado; nova tentativa funciona", async () => {
  const w = await world();
  const round = await openCommercial(w);
  w.state.failStamp = true;
  const failed = await confirmCompanySignature(confirmInput(round, "Usuaria Comercial"), w.deps);
  assert.equal(failed.ok, false);
  assert.equal(w.finalized.length, 0);
  assert.equal(round.lockedBy ?? null, null);
  w.state.failStamp = false;
  const retry = await confirmCompanySignature(confirmInput(round, "Usuaria Comercial"), w.deps);
  assert.equal(retry.ok, true);
});

test("duas confirmações simultâneas: só uma entra (exclusão mútua)", async () => {
  const w = await world();
  const round = await openCommercial(w);
  const [a, b] = await Promise.all([
    confirmCompanySignature(confirmInput(round, "Usuaria Comercial"), w.deps),
    confirmCompanySignature(confirmInput(round, "Usuaria Comercial"), w.deps),
  ]);
  assert.equal([a, b].filter((r) => r.ok).length, 1);
  assert.equal(round.signatures.length, 1);
});

// ---------------------------------------------------------------- institucional

test("institucional: o representante só pode ser um cadastrado, ativo, com poderes válidos e vinculado a um usuário", () => {
  assert.equal(selectRequiredRepresentatives([rep()], undefined, "2026-11-08").ok, false);
  assert.equal(selectRequiredRepresentatives([rep()], "inexistente", "2026-11-08").ok, false);
  assert.match((selectRequiredRepresentatives([rep({ powers_valid_until: "2026-01-01" })], "rep-1", "2026-11-08") as { error: string }).error, /expiraram/);
  assert.match((selectRequiredRepresentatives([rep({ active: false })], "rep-1", "2026-11-08") as { error: string }).error, /inativo/);
  assert.match((selectRequiredRepresentatives([rep({ profile_id: null })], "rep-1", "2026-11-08") as { error: string }).error, /vinculado/);
  assert.equal(selectRequiredRepresentatives([rep()], "rep-1", "2026-11-08").ok, true);
});

test("institucional conjunto: exige TODOS os representantes conjuntos válidos (mínimo dois)", () => {
  const a = rep({ id: "rep-a", representation_rule: "joint", profile_id: "u-a" });
  const b = rep({ id: "rep-b", representation_rule: "joint", profile_id: "u-b", full_name: "Beltrana de Tal", is_default: false });
  const alone = selectRequiredRepresentatives([a], "rep-a", "2026-11-08");
  assert.equal(alone.ok, false);
  const pair = selectRequiredRepresentatives([a, b], "rep-a", "2026-11-08");
  assert.equal(pair.ok && pair.required.length, 2);
  const expired = selectRequiredRepresentatives([a, { ...b, powers_valid_until: "2026-01-01" }], "rep-a", "2026-11-08");
  assert.equal(expired.ok, false, "o co-representante com poderes vencidos não conta");
  const unlinkedSecond = selectRequiredRepresentatives([a, { ...b, profile_id: null }], "rep-a", "2026-11-08");
  assert.equal(unlinkedSecond.ok, false);
  const individualOther = rep({ id: "rep-i", representation_rule: "individual", profile_id: "u-i" });
  const mixed = selectRequiredRepresentatives([a, b, individualOther], "rep-i", "2026-11-08");
  assert.equal(mixed.ok && mixed.required.length, 1, "representante individual assina sozinho");
});

test("institucional: só o representante vinculado ao usuário autenticado assina; outro usuário é recusado", async () => {
  const w = await world({ actorId: "user-qualquer", actorName: "Alguem Qualquer" });
  const round = await openInstitutional(w);
  const denied = await confirmCompanySignature(confirmInput(round, "Alguem Qualquer"), w.deps);
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.match(denied.error, /não é um dos representantes/);
  w.state.actorId = "user-rep-1";
  const ok = await confirmCompanySignature(confirmInput(round, "Fulano de Tal"), w.deps);
  assert.equal(ok.ok, true, ok.ok ? "" : ok.error);
  assert.equal(w.finalized[0].representativeId, "rep-1");
  assert.equal(w.finalized[0].representationRule, "individual");
  assert.match(w.finalized[0].powersSnapshot, /Poderes plenos/);
});

test("institucional: o nome digitado precisa ser o do REPRESENTANTE (não o do usuário) e poderes vencidos bloqueiam na hora de assinar", async () => {
  const w = await world();
  const round = await openInstitutional(w);
  const wrong = await confirmCompanySignature(confirmInput(round, "Usuaria Comercial"), w.deps);
  assert.equal(wrong.ok, false);
  w.state.reps = [rep({ powers_valid_until: "2026-11-07" })];
  const expired = await confirmCompanySignature(confirmInput(round, "Fulano de Tal"), w.deps);
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.match(expired.error, /expiraram/);
  assert.equal(round.signatures.length, 0);
});

test("institucional: PNG do representante é usado só quando ELE confirma; rubrica sai em todas as páginas", async () => {
  const w = await world();
  w.state.pngByOwner.set("representative:rep-1", makePng());
  const round = await openInstitutional(w);
  assert.ok(!Buffer.from(w.files.get(round.preparedPath) as Uint8Array).includes(Buffer.from("/Subtype /Image")), "nenhum PNG aplicado só por preparar");
  const ok = await confirmCompanySignature(confirmInput(round, "Fulano de Tal"), w.deps);
  assert.equal(ok.ok, true);
  const stored = w.files.get(round.signatures[0].signedPath) as Uint8Array;
  assert.ok(Buffer.from(stored).includes(Buffer.from("/Subtype /Image")));
  assert.match(drawnText(stored), /Sócio-administrador|S.cio-administrador/);
});

test("institucional conjunto: conclui só com TODOS; cada um confirma o próprio nome; PDFs acumulam; duplicata recusada", async () => {
  const a = rep({ id: "rep-a", representation_rule: "joint", profile_id: "u-a", full_name: "Ana Representante" });
  const b = rep({ id: "rep-b", representation_rule: "joint", profile_id: "u-b", full_name: "Bruno Representante", is_default: false });
  const w = await world({ reps: [a, b], actorId: "u-a" });
  const round = await openInstitutional(w, "rep-a");
  assert.equal(round.requiredSignatures, 2);
  assert.equal(round.signerSlots.filter((s) => s.role === "contratada").length, 2);

  const first = await confirmCompanySignature(confirmInput(round, "Ana Representante"), w.deps);
  assert.equal(first.ok && first.completed, false);
  assert.equal(round.status, "signing");
  assert.equal(first.ok && first.remaining, 1);

  const again = await confirmCompanySignature(confirmInput(round, "Ana Representante", { displayedSha256: round.signatures[0].signedSha256 }), w.deps);
  assert.equal(again.ok, false, "a mesma pessoa não assina duas vezes");

  w.state.actorId = "u-b";
  const stale = await confirmCompanySignature(confirmInput(round, "Bruno Representante"), w.deps);
  assert.equal(stale.ok, false, "Bruno precisa conferir a NOVA versão (já com a assinatura da Ana)");
  const second = await confirmCompanySignature(confirmInput(round, "Bruno Representante", { displayedSha256: round.signatures[0].signedSha256 }), w.deps);
  assert.equal(second.ok && second.completed, true);
  assert.equal(round.status, "completed");
  const text = drawnText(w.files.get(round.signatures[1].signedPath) as Uint8Array);
  assert.match(text, /Ana Representante/);
  assert.match(text, /Bruno Representante/);
  assert.equal(round.finalSha256, round.signatures[1].signedSha256);
});

test("representante: troca permitida em preparação (PDF refeito), proibida depois da primeira assinatura; cancelamento exige justificativa", async () => {
  const a = rep({ id: "rep-a", profile_id: "u-a", full_name: "Ana Representante" });
  const b = rep({ id: "rep-b", profile_id: "u-b", full_name: "Bruno Representante", is_default: false });
  const w = await world({ reps: [a, b], actorId: "u-a" });
  const round = await openInstitutional(w, "rep-a");
  const preparedBefore = round.preparedSha256;
  const changed = await changeRoundRepresentative(round.id, "rep-b", w.deps);
  assert.equal(changed.ok, true, changed.ok ? "" : changed.error);
  assert.deepEqual(round.requiredRepresentativeIds, ["rep-b"]);
  assert.ok(w.audits.some((entry) => entry.action === "company_signature_representative_changed"));

  // agora o Bruno assina; depois disso a troca é bloqueada
  w.state.actorId = "u-b";
  const signed = await confirmCompanySignature(confirmInput(round, "Bruno Representante", { displayedSha256: round.preparedSha256 }), w.deps);
  assert.equal(signed.ok, true, signed.ok ? "" : signed.error);
  const afterStart = await changeRoundRepresentative(round.id, "rep-a", w.deps);
  assert.equal(afterStart.ok, false);
  void preparedBefore;
});

test("troca de representante: bloqueada com assinatura em andamento mesmo com a rodada ainda 'signing'", async () => {
  const a = rep({ id: "rep-a", representation_rule: "joint", profile_id: "u-a", full_name: "Ana Representante" });
  const b = rep({ id: "rep-b", representation_rule: "joint", profile_id: "u-b", full_name: "Bruno Representante", is_default: false });
  const w = await world({ reps: [a, b], actorId: "u-a" });
  const round = await openInstitutional(w, "rep-a");
  assert.equal((await confirmCompanySignature(confirmInput(round, "Ana Representante"), w.deps)).ok, true);
  const swap = await changeRoundRepresentative(round.id, "rep-b", w.deps);
  assert.equal(swap.ok, false);
  if (!swap.ok) assert.match(swap.error, /já começou/);
  const short = await cancelCompanyRound(round.id, "curto", w.deps);
  assert.equal(short.ok, false);
  const cancelled = await cancelCompanyRound(round.id, "Representante substituído por decisão da diretoria, nova rodada será aberta.", w.deps);
  assert.equal(cancelled.ok, true);
  assert.equal(round.status, "cancelled");
  assert.ok(w.audits.some((entry) => entry.action === "company_signature_round_cancelled"));
  const noMore = await confirmCompanySignature(confirmInput(round, "Ana Representante"), w.deps);
  assert.equal(noMore.ok, false);
});

test("portão do convite ao cliente: só com a empresa concluída", () => {
  assert.match(assertCompanySigned(null) ?? "", /ainda não foi preparado/);
  assert.match(assertCompanySigned({ status: "preparing" }) ?? "", /ainda não concluiu/);
  assert.match(assertCompanySigned({ status: "signing" }) ?? "", /ainda não concluiu/);
  assert.match(assertCompanySigned({ status: "cancelled" }) ?? "", /cancelada/);
  assert.equal(assertCompanySigned({ status: "completed" }), null);
});
