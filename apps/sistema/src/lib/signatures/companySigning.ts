import { createHash } from "node:crypto";
import { evaluateRepresentative, type LegalRepresentativeRow } from "../contracts/contractorProfile";
import type { PlacedField, SignerSlot } from "./signaturePlacement";
import { CONFIRMATION_STATEMENT } from "./companySigningText";

export { CONFIRMATION_STATEMENT };

/**
 * Assinatura eletrônica pela EMPRESA (Etapa 3A) — orquestração com
 * dependências injetáveis (testável sem rede; PDF, storage e banco ficam nos
 * adaptadores reais das Server Actions).
 *
 * Princípios:
 *  - A imagem PNG é só representação visual. O ato é a ação EXPLÍCITA do
 *    signatário autenticado: nome digitado + declaração + senha reconfirmada +
 *    hash da versão que ele viu. Estar logado nunca assina nada.
 *  - Comercial: só quem tem a concessão explícita `contratos_assinar`
 *    (verificada no servidor). Institucional: o representante legal cadastrado
 *    e vinculado a ESTE usuário, com poderes válidos na data; representação
 *    conjunta exige todos os representantes conjuntos ativos e válidos.
 *  - A rodada fica em "preparação" (representante pode ser trocado) até a
 *    primeira confirmação; depois disso o banco recusa trocar representante ou
 *    documento — só cancelar com justificativa, o que é auditado.
 *  - Cada confirmação parte do PDF anterior da rodada, confere o hash dele
 *    antes de carimbar e grava um novo arquivo (nunca sobrescreve).
 */

export type SigningModality = "commercial" | "institutional";
export type RoundStatus = "preparing" | "signing" | "completed" | "cancelled";

export interface RoundSignature {
  sequence: number;
  signerKey: string;
  profileId: string;
  representativeId?: string | null;
  signedPath: string;
  signedSha256: string;
  signedAt: string;
}

export interface CompanyRound {
  id: string;
  modality: SigningModality;
  status: RoundStatus;
  commercialDocumentId?: string | null;
  contractId?: string | null;
  sourceDocumentId?: string | null;
  representativeId?: string | null;
  requiredRepresentativeIds: string[];
  requiredSignatures: number;
  signerSlots: SignerSlot[];
  layoutMode: "automatic" | "manual";
  layoutFields: PlacedField[];
  documentTitle: string;
  originalPath: string;
  originalSha256: string;
  preparedPath: string;
  preparedSha256: string;
  finalPath?: string | null;
  finalSha256?: string | null;
  signatures: RoundSignature[];
}

export interface RoundSource {
  title: string;
  path: string;
  bytes: Uint8Array;
  /** Hash registrado quando o documento foi emitido (comercial). Se existir, precisa bater com os bytes. */
  recordedSha256?: string;
  templateId?: string;
  templateVersion?: number;
}

export interface PreparedPdf {
  bytes: Uint8Array;
  layoutMode: "automatic" | "manual";
  layoutFields: PlacedField[];
}

export interface NewRoundRow {
  id: string;
  modality: SigningModality;
  commercialDocumentId?: string;
  contractId?: string;
  sourceDocumentId?: string;
  representativeId?: string;
  requiredRepresentativeIds: string[];
  requiredSignatures: number;
  signerSlots: SignerSlot[];
  layoutMode: "automatic" | "manual";
  layoutFields: PlacedField[];
  documentTitle: string;
  originalPath: string;
  originalSha256: string;
  preparedPath: string;
  preparedSha256: string;
}

export interface RoundReference {
  modality: SigningModality;
  commercialDocumentId?: string;
  contractId?: string;
  documentId?: string;
}

export interface FinalizeParams {
  roundId: string;
  profileId: string;
  representativeId?: string;
  signerKey: string;
  signerName: string;
  signerTitle: string;
  powersSnapshot: string;
  representationRule: "individual" | "joint" | "authorized_user";
  sourceSha256: string;
  signedPath: string;
  signedSha256: string;
  signaturePngSha256?: string;
  audit: Record<string, unknown>;
}

export interface CompanySigningDeps {
  newId: () => string;
  now: () => Date;
  /** Permissão para PREPARAR/ALTERAR/CANCELAR a rodada (null = permitido). */
  checkPrepare: (modality: SigningModality) => Promise<string | null>;
  /** Concessão explícita contratos_assinar (comercial). null = concedida. */
  checkSigningGrant: () => Promise<string | null>;
  loadSource: (ref: RoundReference) => Promise<RoundSource | null>;
  loadRepresentatives: () => Promise<Array<LegalRepresentativeRow & { profile_id?: string | null }>>;
  /** Layout manual salvo para a versão do modelo (PDF externo/modelo especial), se houver. */
  loadManualLayout: (templateId: string, templateVersion: number) => Promise<PlacedField[] | null>;
  preparePdf: (input: { originalBytes: Uint8Array; signers: SignerSlot[]; documentTitle: string; manualFields?: PlacedField[] }) => Promise<PreparedPdf>;
  stampPdf: (input: {
    baseBytes: Uint8Array; fields: PlacedField[]; hasPlaceholders: boolean; signerName: string; signerTitle: string;
    signaturePng?: Uint8Array; signedAtIso: string; baseSha256: string;
  }) => Promise<Uint8Array>;
  pathFor: (round: { id: string; modality: SigningModality; contractId?: string }, kind: "prepared" | "signed", sequence: number, sha256: string) => string;
  /** Grava SEM sobrescrever; se o objeto já existir com o mesmo hash, reaproveita. */
  writePdf: (path: string, bytes: Uint8Array, sha256: string) => Promise<void>;
  readPdf: (path: string) => Promise<Uint8Array>;
  findActiveRound: (ref: RoundReference) => Promise<CompanyRound | null>;
  getRound: (roundId: string) => Promise<CompanyRound | null>;
  createRound: (row: NewRoundRow, actorId: string) => Promise<CompanyRound>;
  reprepareRound: (roundId: string, patch: Omit<NewRoundRow, "id" | "modality" | "commercialDocumentId" | "contractId" | "sourceDocumentId" | "documentTitle" | "originalPath" | "originalSha256">) => Promise<CompanyRound>;
  cancelRound: (roundId: string, actorId: string, reason: string) => Promise<void>;
  claimTurn: (roundId: string, profileId: string, representativeId: string | undefined, signerKey: string) => Promise<{ basePath: string; baseSha256: string; nextSequence: number }>;
  releaseTurn: (roundId: string, profileId: string) => Promise<void>;
  finalize: (params: FinalizeParams) => Promise<{ completed: boolean; finalDocumentId?: string | null }>;
  /** PNG da pessoa que confirma (perfil, comercial) ou do representante (institucional); nulo se não houver. */
  loadSignaturePng: (owner: { kind: "profile" | "representative"; id: string }) => Promise<{ bytes: Uint8Array; sha256: string } | null>;
  /** Reconfirma a senha da sessão atual (passo de autenticação explícita). */
  reauthenticate: (password: string) => Promise<boolean>;
  actor: () => Promise<{ profileId: string; name: string }>;
  audit: (entityId: string, action: string, metadata: Record<string, unknown>) => Promise<void>;
}

export const sha256Hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalizeName = (value: string): string =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export const CLIENT_SLOT: SignerSlot = { key: "contratante-1", role: "contratante", label: "CONTRATANTE" };

export type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

// ---------------------------------------------------------------- representantes

export interface RepresentativeSelection {
  chosen: LegalRepresentativeRow & { profile_id?: string | null };
  required: Array<LegalRepresentativeRow & { profile_id?: string | null }>;
}

/**
 * Quem precisa confirmar pelo lado da empresa (institucional): o escolhido, ou,
 * na representação CONJUNTA, todos os representantes conjuntos ativos com poderes
 * válidos (mínimo dois). Cada um precisa estar vinculado a um usuário para
 * poder se autenticar. Nunca presume poderes nem troca de representante.
 */
export function selectRequiredRepresentatives(
  representatives: Array<LegalRepresentativeRow & { profile_id?: string | null }>,
  chosenId: string | undefined,
  todayIso: string,
): Result<RepresentativeSelection> {
  if (!chosenId) return { ok: false, error: "Escolha o representante legal que assinará pela empresa." };
  const chosen = representatives.find((rep) => rep.id === chosenId);
  if (!chosen) return { ok: false, error: "O representante escolhido não está mais disponível. Escolha outro." };
  const status = evaluateRepresentative(chosen, todayIso);
  if (!status.valid) return { ok: false, error: status.reason ?? "Poderes do representante inválidos." };

  let required = [chosen];
  if (chosen.representation_rule === "joint") {
    required = representatives.filter((rep) => rep.representation_rule === "joint" && evaluateRepresentative(rep, todayIso).valid);
    if (required.length < 2) {
      return { ok: false, error: "Representação conjunta exige ao menos dois representantes conjuntos ativos com poderes válidos. Cadastre ou regularize os demais antes de assinar." };
    }
    if (!required.some((rep) => rep.id === chosen.id)) required.push(chosen);
  }
  const unlinked = required.find((rep) => !rep.profile_id);
  if (unlinked) {
    return { ok: false, error: `${unlinked.full_name} ainda não está vinculado(a) a um usuário do sistema. Vincule em Configurações → Dados da empresa para que possa confirmar a assinatura autenticado(a).` };
  }
  const profileIds = required.map((rep) => rep.profile_id as string);
  if (new Set(profileIds).size !== profileIds.length) {
    return { ok: false, error: "Cada representante precisa estar vinculado a um usuário diferente." };
  }
  return { ok: true, chosen, required };
}

function signerSlotsFor(modality: SigningModality, requiredCount: number): SignerSlot[] {
  const count = modality === "commercial" ? 1 : requiredCount;
  const company: SignerSlot[] = [];
  for (let index = 0; index < count; index += 1) {
    company.push({ key: `contratada-${index + 1}`, role: "contratada", label: count > 1 ? `CONTRATADA - Representante ${index + 1}` : "CONTRATADA" });
  }
  return [...company, CLIENT_SLOT];
}

// ---------------------------------------------------------------- abrir rodada

export interface OpenRoundInput extends RoundReference {
  representativeId?: string;
}

async function buildPrepared(source: RoundSource, slots: SignerSlot[], deps: CompanySigningDeps, explicitManual?: PlacedField[]): Promise<Result<{ prepared: PreparedPdf }>> {
  let manualFields: PlacedField[] | undefined = explicitManual;
  if (!manualFields && source.templateId && source.templateVersion) {
    const saved = await deps.loadManualLayout(source.templateId, source.templateVersion);
    if (saved && saved.length > 0) manualFields = saved;
  }
  try {
    const prepared = await deps.preparePdf({ originalBytes: source.bytes, signers: slots, documentTitle: source.title, manualFields });
    return { ok: true, prepared };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível preparar o PDF.";
    return { ok: false, error: manualFields ? `O posicionamento salvo para esta versão do modelo não serve para este documento: ${message}` : message };
  }
}

async function loadVerifiedSource(ref: RoundReference, deps: CompanySigningDeps): Promise<Result<{ source: RoundSource; sha256: string }>> {
  const source = await deps.loadSource(ref);
  if (!source) return { ok: false, error: "Documento não encontrado." };
  const sha256 = sha256Hex(source.bytes);
  if (source.recordedSha256 && source.recordedSha256 !== sha256) {
    return { ok: false, error: "O PDF armazenado não confere com o hash registrado na emissão. A assinatura foi bloqueada: documento possivelmente alterado." };
  }
  return { ok: true, source, sha256 };
}

export async function openCompanyRound(input: OpenRoundInput, deps: CompanySigningDeps): Promise<Result<{ round: CompanyRound; reused: boolean }>> {
  const denied = await deps.checkPrepare(input.modality);
  if (denied) return { ok: false, error: denied };
  const actor = await deps.actor();

  if (input.modality === "commercial") {
    if (!input.commercialDocumentId || !UUID_RE.test(input.commercialDocumentId)) return { ok: false, error: "Documento comercial inválido." };
  } else if (!input.contractId || !input.documentId || !UUID_RE.test(input.contractId) || !UUID_RE.test(input.documentId)) {
    return { ok: false, error: "Contrato ou documento inválido." };
  }

  const existing = await deps.findActiveRound(input);
  if (existing) return { ok: true, round: existing, reused: true };

  const verified = await loadVerifiedSource(input, deps);
  if (!verified.ok) return verified;

  const todayIso = deps.now().toISOString().slice(0, 10);
  let requiredRepresentativeIds: string[] = [];
  let requiredSignatures = 1;
  if (input.modality === "institutional") {
    const selection = selectRequiredRepresentatives(await deps.loadRepresentatives(), input.representativeId, todayIso);
    if (!selection.ok) return selection;
    requiredRepresentativeIds = selection.required.map((rep) => rep.id);
    requiredSignatures = requiredRepresentativeIds.length;
  }

  const slots = signerSlotsFor(input.modality, requiredSignatures);
  const built = await buildPrepared(verified.source, slots, deps);
  if (!built.ok) return built;

  const id = deps.newId();
  const preparedSha = sha256Hex(built.prepared.bytes);
  const preparedPath = deps.pathFor({ id, modality: input.modality, contractId: input.contractId }, "prepared", 0, preparedSha);
  await deps.writePdf(preparedPath, built.prepared.bytes, preparedSha);

  const round = await deps.createRound({
    id,
    modality: input.modality,
    commercialDocumentId: input.commercialDocumentId,
    contractId: input.contractId,
    sourceDocumentId: input.documentId,
    representativeId: input.modality === "institutional" ? input.representativeId : undefined,
    requiredRepresentativeIds,
    requiredSignatures,
    signerSlots: slots,
    layoutMode: built.prepared.layoutMode,
    layoutFields: built.prepared.layoutFields,
    documentTitle: verified.source.title,
    originalPath: verified.source.path,
    originalSha256: verified.sha256,
    preparedPath,
    preparedSha256: preparedSha,
  }, actor.profileId);

  await deps.audit(round.id, "company_signature_round_opened", {
    modality: input.modality, layoutMode: built.prepared.layoutMode, requiredSignatures,
    representativeId: input.representativeId ?? null, originalSha256: verified.sha256, preparedSha256: preparedSha,
  });
  return { ok: true, round, reused: false };
}

// -------------------------------------------------- trocar representante (preparação)

export async function changeRoundRepresentative(roundId: string, representativeId: string, deps: CompanySigningDeps): Promise<Result<{ round: CompanyRound }>> {
  const round = await deps.getRound(roundId);
  if (!round) return { ok: false, error: "Rodada de assinatura não encontrada." };
  const denied = await deps.checkPrepare(round.modality);
  if (denied) return { ok: false, error: denied };
  if (round.modality !== "institutional") return { ok: false, error: "A troca de representante vale só para contratos institucionais." };
  if (round.status !== "preparing" || round.signatures.length > 0) {
    return { ok: false, error: "A assinatura já começou: o representante não pode ser trocado em silêncio. Cancele esta rodada com justificativa e abra outra, se necessário." };
  }
  const selection = selectRequiredRepresentatives(await deps.loadRepresentatives(), representativeId, deps.now().toISOString().slice(0, 10));
  if (!selection.ok) return selection;

  const loaded = await deps.readPdf(round.originalPath);
  if (sha256Hex(loaded) !== round.originalSha256) {
    return { ok: false, error: "O PDF original não confere mais com o hash registrado. Operação bloqueada." };
  }
  const slots = signerSlotsFor("institutional", selection.required.length);
  const built = await buildPrepared({ title: round.documentTitle, path: round.originalPath, bytes: loaded }, slots, deps, round.layoutMode === "manual" ? round.layoutFields : undefined);
  if (!built.ok) return built;
  const preparedSha = sha256Hex(built.prepared.bytes);
  const preparedPath = deps.pathFor({ id: round.id, modality: "institutional", contractId: round.contractId ?? undefined }, "prepared", 0, preparedSha);
  await deps.writePdf(preparedPath, built.prepared.bytes, preparedSha);

  const updated = await deps.reprepareRound(round.id, {
    representativeId,
    requiredRepresentativeIds: selection.required.map((rep) => rep.id),
    requiredSignatures: selection.required.length,
    signerSlots: slots,
    layoutMode: built.prepared.layoutMode,
    layoutFields: built.prepared.layoutFields,
    preparedPath,
    preparedSha256: preparedSha,
  });
  await deps.audit(round.id, "company_signature_representative_changed", {
    previousRepresentativeId: round.representativeId ?? null, representativeId, preparedSha256: preparedSha,
  });
  return { ok: true, round: updated };
}

export async function cancelCompanyRound(roundId: string, reason: string, deps: CompanySigningDeps): Promise<Result<{ cancelled: true }>> {
  const round = await deps.getRound(roundId);
  if (!round) return { ok: false, error: "Rodada de assinatura não encontrada." };
  const denied = await deps.checkPrepare(round.modality);
  if (denied) return { ok: false, error: denied };
  if (round.status === "completed") return { ok: false, error: "Documento já assinado pela empresa: não pode ser cancelado nem alterado. Use um aditivo." };
  if (round.status === "cancelled") return { ok: false, error: "Esta rodada já foi cancelada." };
  const text = reason.trim();
  if (text.length < 20 || text.length > 1000) return { ok: false, error: "Justifique o cancelamento em 20 a 1000 caracteres." };
  const actor = await deps.actor();
  await deps.cancelRound(round.id, actor.profileId, text);
  await deps.audit(round.id, "company_signature_round_cancelled", { reason: text, hadSignatures: round.signatures.length, status: round.status });
  return { ok: true, cancelled: true };
}

// ---------------------------------------------------------------- confirmar

export interface ConfirmInput {
  roundId: string;
  /** Nome completo digitado pelo signatário (confirmação explícita). */
  typedName: string;
  acceptedStatement: boolean;
  password: string;
  /** Hash da versão do documento que foi exibida ao signatário. */
  displayedSha256: string;
}

export interface ConfirmOutcome {
  completed: boolean;
  remaining: number;
  signedSha256: string;
  signerName: string;
  finalDocumentId?: string | null;
}


export async function confirmCompanySignature(input: ConfirmInput, deps: CompanySigningDeps): Promise<Result<ConfirmOutcome>> {
  if (!UUID_RE.test(input.roundId)) return { ok: false, error: "Rodada inválida." };
  if (!input.acceptedStatement) return { ok: false, error: "Marque a declaração para confirmar a assinatura." };
  if (!/^[0-9a-f]{64}$/.test(input.displayedSha256)) return { ok: false, error: "Identificação da versão do documento ausente. Recarregue a página." };
  if (!input.password) return { ok: false, error: "Informe sua senha para confirmar a assinatura." };

  const round = await deps.getRound(input.roundId);
  if (!round) return { ok: false, error: "Rodada de assinatura não encontrada." };
  if (round.status === "completed") return { ok: false, error: "Este documento já foi assinado pela empresa. Nada mais pode ser assinado nele." };
  if (round.status === "cancelled") return { ok: false, error: "Esta rodada de assinatura foi cancelada." };

  const actor = await deps.actor();
  const todayIso = deps.now().toISOString().slice(0, 10);

  // 1) Quem é o signatário e com que autoridade.
  let signerName = actor.name;
  let signerTitle = "";
  let powers = "";
  let rule: FinalizeParams["representationRule"] = "authorized_user";
  let representativeId: string | undefined;
  let signerKey = "contratada-1";
  let pngOwner: { kind: "profile" | "representative"; id: string };

  if (round.modality === "commercial") {
    const denied = await deps.checkSigningGrant();
    if (denied) return { ok: false, error: denied };
    if (round.signatures.some((signature) => signature.profileId === actor.profileId)) {
      return { ok: false, error: "Você já assinou este documento." };
    }
    signerTitle = "Usuario autorizado pela empresa (concessao explicita)";
    powers = "Concessao explicita 'assinar contratos comerciais' registrada no sistema; nao comprova poderes estatutarios.";
    pngOwner = { kind: "profile", id: actor.profileId };
  } else {
    const representatives = await deps.loadRepresentatives();
    const mine = round.requiredRepresentativeIds
      .map((id) => representatives.find((rep) => rep.id === id))
      .find((rep) => rep && rep.profile_id === actor.profileId);
    if (!mine) return { ok: false, error: "Você não é um dos representantes legais exigidos para assinar este documento." };
    const status = evaluateRepresentative(mine, todayIso);
    if (!status.valid) return { ok: false, error: `${status.reason ?? "Poderes inválidos."} A assinatura foi bloqueada.` };
    if (round.signatures.some((signature) => signature.representativeId === mine.id || signature.profileId === actor.profileId)) {
      return { ok: false, error: "Esta assinatura já foi registrada neste documento." };
    }
    signerName = mine.full_name;
    signerTitle = mine.role_title;
    powers = mine.powers_description;
    rule = mine.representation_rule;
    representativeId = mine.id;
    const index = round.requiredRepresentativeIds.indexOf(mine.id);
    signerKey = `contratada-${index + 1}`;
    pngOwner = { kind: "representative", id: mine.id };
  }
  if (!round.signerSlots.some((slot) => slot.key === signerKey)) return { ok: false, error: "Campo de assinatura da empresa não encontrado no documento preparado." };

  // 2) Ato explícito: nome digitado + senha reconfirmada.
  if (normalizeName(input.typedName) !== normalizeName(signerName)) {
    return { ok: false, error: `Digite exatamente o nome completo do signatário (${signerName}) para confirmar.` };
  }
  if (!(await deps.reauthenticate(input.password))) {
    return { ok: false, error: "Senha incorreta. A assinatura não foi registrada." };
  }

  // 3) Reivindica a vez (exclusão mútua + duplicidade no banco) e confere a versão vista.
  let claim: { basePath: string; baseSha256: string; nextSequence: number };
  try {
    claim = await deps.claimTurn(round.id, actor.profileId, representativeId, signerKey);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível iniciar a assinatura." };
  }
  const fail = async (error: string): Promise<Result<ConfirmOutcome>> => {
    await deps.releaseTurn(round.id, actor.profileId).catch(() => undefined);
    return { ok: false, error };
  };

  if (claim.baseSha256 !== input.displayedSha256) {
    return fail("O documento mudou desde que você o abriu (outra assinatura foi registrada). Recarregue e confira a nova versão antes de assinar.");
  }

  try {
    const baseBytes = await deps.readPdf(claim.basePath);
    if (sha256Hex(baseBytes) !== claim.baseSha256) {
      return fail("O PDF armazenado não confere com o hash registrado. A assinatura foi bloqueada: documento possivelmente alterado.");
    }
    const png = await deps.loadSignaturePng(pngOwner).catch(() => null);
    const signedAt = deps.now();
    const fields = round.layoutFields.filter((field) => field.signerKey === signerKey);
    const signedBytes = await deps.stampPdf({
      baseBytes, fields, hasPlaceholders: round.layoutMode === "automatic",
      signerName, signerTitle, signaturePng: png?.bytes, signedAtIso: signedAt.toISOString(), baseSha256: claim.baseSha256,
    });
    const signedSha = sha256Hex(signedBytes);
    const signedPath = deps.pathFor({ id: round.id, modality: round.modality, contractId: round.contractId ?? undefined }, "signed", claim.nextSequence, signedSha);
    await deps.writePdf(signedPath, signedBytes, signedSha);

    const result = await deps.finalize({
      roundId: round.id, profileId: actor.profileId, representativeId, signerKey, signerName, signerTitle,
      powersSnapshot: powers, representationRule: rule, sourceSha256: claim.baseSha256, signedPath, signedSha256: signedSha,
      signaturePngSha256: png?.sha256,
      audit: {
        consent: CONFIRMATION_STATEMENT, typedName: input.typedName.trim(), reauthenticated: true,
        displayedSha256: input.displayedSha256, visualRepresentation: png ? "png" : "text", signedAt: signedAt.toISOString(),
        modality: round.modality, layoutMode: round.layoutMode,
      },
    });

    await deps.audit(round.id, "company_signature_confirmed", {
      modality: round.modality, signerKey, representativeId: representativeId ?? null, sequence: claim.nextSequence,
      sourceSha256: claim.baseSha256, signedSha256: signedSha, pngSha256: png?.sha256 ?? null, completed: result.completed,
    });
    return {
      ok: true, completed: result.completed, remaining: Math.max(round.requiredSignatures - claim.nextSequence, 0),
      signedSha256: signedSha, signerName, finalDocumentId: result.finalDocumentId,
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Não foi possível concluir a assinatura. Nada foi registrado; tente novamente.");
  }
}

// ------------------------------------------------- portão para o convite ao cliente

/**
 * O convite ao cliente só pode ser disponibilizado depois que a empresa assinou
 * (rodada concluída). A barreira definitiva também existe no banco (triggers
 * nas duas tabelas de convites).
 */
export function assertCompanySigned(round: Pick<CompanyRound, "status"> | null): string | null {
  if (!round) return "Este documento ainda não foi preparado para assinatura pela empresa. Prepare e assine pela empresa antes de convidar o cliente.";
  if (round.status === "completed") return null;
  if (round.status === "cancelled") return "A rodada de assinatura da empresa foi cancelada. Prepare uma nova antes de convidar o cliente.";
  return "A empresa ainda não concluiu a assinatura deste documento. O convite ao cliente só pode ser criado depois.";
}
