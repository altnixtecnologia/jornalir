import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewspaperEdition } from "@ir/types";
import type { NewspaperEditionChanges, NewspaperEditionRepository, NewNewspaperEditionRecord } from "@ir/core";
import { signEditionPdfUrl } from "./editionPdfStorage.supabase";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

const PREVIEW_EDITIONS: NewspaperEdition[] = [
  {
    id: "preview-edicao-1",
    editionNumber: 700,
    reference: "ED-2026-700",
    title: "Edição 700 (visualização local)",
    publicationDate: "2026-10-01",
    pdfUrl: undefined,
    pageCount: 28,
    active: true,
    createdAt: new Date(0).toISOString(),
  },
];

const TABLE = "newspaper_editions";
// Uma única string literal (sem concatenação com `+`): o operador `+`
// alarga o tipo para `string` (perde o tipo literal), e o parser de tipos
// do supabase-js precisa do tipo literal exato da string de `select()` —
// sem isso, a consulta inteira degrada silenciosamente para
// `GenericStringError` em tempo de tipo (sem erro em runtime, só no tsc).
const COLUMNS =
  "id, edition_number, publication_date, title, pdf_url, pdf_storage_path, cover_url, archive_provider, pdf_r2_key, pdf_file_name, pdf_sha256, page_count, active, created_at, online_status, online_error, scheduled_available_at, available_at, notification_status, notification_sent_at, materias_status, materias_candidate_count, materias_draft_count, materias_failed_count, materias_started_at, materias_finished_at, uploaded_by, uploaded_at, scheduled_by";

interface NewspaperEditionRow {
  id: string;
  edition_number: number;
  publication_date: string;
  title: string | null;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  cover_url: string | null;
  archive_provider: "r2" | "drive" | "supabase" | "external" | null;
  pdf_r2_key: string | null;
  pdf_file_name: string | null;
  pdf_sha256: string | null;
  page_count: number | null;
  active: boolean;
  created_at: string;
  online_status?: "preparing" | "scheduled" | "available" | "attention" | null;
  online_error?: string | null;
  scheduled_available_at?: string | null;
  available_at?: string | null;
  notification_status?: "pending" | "queued" | "sent" | "partial" | "failed" | "skipped" | "uncertain" | null;
  notification_sent_at?: string | null;
  materias_status?: "queued" | "processing" | "completed" | "partial" | "failed" | null;
  materias_candidate_count?: number | null;
  materias_draft_count?: number | null;
  materias_failed_count?: number | null;
  materias_started_at?: string | null;
  materias_finished_at?: string | null;
  uploaded_by?: string | null;
  uploaded_at?: string | null;
  scheduled_by?: string | null;
}

/** Nomes de perfis em lote (evita N+1 e evita o parser de tipos do select-string
 * do supabase-js, que não reconhece embeds com FK explícita e cai pra
 * `GenericStringError`). Uma consulta simples por id é mais robusta aqui. */
async function fetchProfileNames(client: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (uniqueIds.length === 0) return new Map();
  const { data, error } = await client.from("profiles").select("id, name").in("id", uniqueIds);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [row.id as string, (row.name as string | null) ?? ""]));
}

/**
 * `NewspaperEdition.reference` (domínio, ex.: "ED-2026-038") não tem coluna
 * própria — gerado aqui a partir do ano da `publication_date` +
 * `edition_number` (o campo real e próprio do número, item 3 da Fase 28).
 *
 * `pdfUrl`: quando o PDF foi enviado por upload (`pdf_storage_path`
 * preenchido, bucket privado), uma URL assinada é gerada na hora — nunca
 * fica guardada/expirada no banco. Sem upload, cai para `pdf_url` (uma URL
 * externa já hospedada, colada manualmente).
 */
async function toDomain(
  client: SupabaseClient,
  row: NewspaperEditionRow,
  profileNames?: Map<string, string>,
): Promise<NewspaperEdition> {
  const pdfUrl = row.pdf_storage_path
    ? await signEditionPdfUrl(client, row.pdf_storage_path)
    : row.pdf_url ?? undefined;
  const year = row.publication_date.slice(0, 4);
  return {
    id: row.id,
    editionNumber: row.edition_number,
    reference: `ED-${year}-${String(row.edition_number).padStart(3, "0")}`,
    title: row.title ?? `Edição ${row.edition_number}`,
    publicationDate: row.publication_date,
    pdfUrl,
    coverUrl: row.cover_url ?? undefined,
    archiveProvider: row.archive_provider ?? undefined,
    pdfR2Key: row.pdf_r2_key ?? undefined,
    pdfFileName: row.pdf_file_name ?? undefined,
    pdfSha256: row.pdf_sha256 ?? undefined,
    pageCount: row.page_count ?? undefined,
    active: row.active,
    createdAt: row.created_at,
    onlineStatus: row.online_status ?? undefined,
    onlineError: row.online_error ?? undefined,
    scheduledAvailableAt: row.scheduled_available_at ?? undefined,
    availableAt: row.available_at ?? undefined,
    notificationStatus: row.notification_status ?? undefined,
    notificationSentAt: row.notification_sent_at ?? undefined,
    materiasStatus: row.materias_status ?? null,
    materiasCandidateCount: row.materias_candidate_count ?? undefined,
    materiasDraftCount: row.materias_draft_count ?? undefined,
    materiasFailedCount: row.materias_failed_count ?? undefined,
    materiasStartedAt: row.materias_started_at ?? undefined,
    materiasFinishedAt: row.materias_finished_at ?? undefined,
    uploadedByName: (row.uploaded_by && profileNames?.get(row.uploaded_by)) || undefined,
    uploadedAt: row.uploaded_at ?? undefined,
    scheduledByName: (row.scheduled_by && profileNames?.get(row.scheduled_by)) || undefined,
  };
}

/**
 * Associa o PDF enviado por upload a uma edição — `pdf_storage_path` não
 * faz parte do contrato de domínio (`NewspaperEditionChanges`), é detalhe
 * do provider real, como `registerUploadedMediaAsset` (Fase 26). Limpa
 * `pdf_url` (URL externa) quando um upload substitui uma referência
 * externa antiga — nunca os dois ao mesmo tempo.
 */
export interface R2EditionArchiveMetadata {
  key: string;
  /** `null` quando o bucket não tem URL pública configurada (privado de
   * propósito) — a entrega real ao navegador usa as rotas de proxy do
   * portal, nunca este link direto. */
  publicUrl: string | null;
  fileName: string;
  fileSize: number;
  sha256: string;
  coverKey?: string;
  coverUrl?: string | null;
  pageCount?: number;
}

/**
 * Associa o arquivo oficial arquivado no Cloudflare R2. O banco guarda
 * somente metadados e URLs; os bytes permanecem no object storage.
 */
export async function attachEditionR2Archive(
  client: SupabaseClient,
  editionId: string,
  archive: R2EditionArchiveMetadata,
): Promise<void> {
  const { error } = await client
    .from(TABLE)
    .update({
      archive_provider: "r2",
      pdf_url: archive.publicUrl,
      pdf_storage_path: null,
      pdf_r2_key: archive.key,
      pdf_file_name: archive.fileName,
      pdf_file_size: archive.fileSize,
      pdf_sha256: archive.sha256,
      cover_r2_key: archive.coverKey ?? null,
      cover_url: archive.coverUrl ?? null,
      page_count: archive.pageCount ?? null,
      archived_at: new Date().toISOString(),
    })
    .eq("id", editionId);
  if (error) throw new Error(error.message);
}

export async function attachEditionPdf(
  client: SupabaseClient,
  editionId: string,
  storagePath: string,
): Promise<void> {
  const { error } = await client
    .from(TABLE)
    .update({
      archive_provider: "supabase",
      pdf_storage_path: storagePath,
      pdf_url: null,
      pdf_r2_key: null,
      pdf_file_name: null,
      pdf_file_size: null,
      pdf_sha256: null,
      archived_at: new Date().toISOString(),
    })
    .eq("id", editionId);
  if (error) throw new Error(error.message);
}


/**
 * Associa um PDF externo (Google Drive) à edição. Novos PDFs do Jornal
 * Online ficam fora do Supabase Storage; o banco guarda só a URL.
 * pdf_storage_path é limpo para que a URL externa passe a ser a fonte.
 */
export async function attachEditionExternalPdf(
  client: SupabaseClient,
  editionId: string,
  pdfUrl: string,
): Promise<void> {
  const { error } = await client
    .from(TABLE)
    .update({
      archive_provider: pdfUrl.includes("drive.google.com") ? "drive" : "external",
      pdf_url: pdfUrl,
      pdf_storage_path: null,
      pdf_r2_key: null,
      archived_at: new Date().toISOString(),
    })
    .eq("id", editionId);
  if (error) throw new Error(error.message);
}

/**
 * Marca quem/quando enviou ou vinculou o PDF oficial, e agenda a
 * disponibilização padrão (dia seguinte 07:00 America/Sao_Paulo, calculado
 * pelo chamador) — só quando a edição AINDA não tinha nenhum agendamento
 * (nunca sobrescreve um horário já definido manualmente por reenvio do
 * mesmo arquivo/reprocessamento). `onlineStatus` passa a 'scheduled'.
 *
 * CORREÇÃO DA AUDITORIA (item 1, prioridade máxima, 06/11/2026): a decisão
 * de desativar a edição olha `active` de verdade, lido AGORA do banco —
 * nunca só `online_status` (que, sem o backfill da migration, começaria
 * 'preparing' em qualquer edição histórica). Uma edição que já estava
 * `active=true` ANTES desta chamada NUNCA é desativada aqui, mesmo que o
 * backfill remoto ainda não tenha sido aplicado — a proteção não depende
 * só da migration (defesa em profundidade pedida pelo usuário).
 */
export async function markEditionUploadedAndSchedule(
  client: SupabaseClient,
  editionId: string,
  input: { uploadedBy: string; defaultScheduledAvailableAtIso: string },
): Promise<void> {
  const { data: current, error: readError } = await client
    .from(TABLE)
    .select("scheduled_available_at, online_status, active, available_at")
    .eq("id", editionId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  // Qualquer sinal de que a edição já estava pública antes desta operação
  // — nunca confiar só em online_status, que pode estar desatualizado
  // (edição histórica sem backfill ainda aplicado).
  const wasAlreadyLive = Boolean(current?.active) || current?.online_status === "available";

  const patch: Record<string, unknown> = {
    uploaded_by: input.uploadedBy,
    uploaded_at: new Date().toISOString(),
    online_error: null,
  };

  if (wasAlreadyLive) {
    // Reaproveitar/anexar o PDF de uma edição que o público já está lendo
    // (ex.: as ~497 edições históricas, ou a 776) NUNCA pode tirá-la do
    // ar nem adiar sua disponibilização — só corrige os metadados de
    // estado para ficarem coerentes com a realidade.
    patch.online_status = "available";
    patch.active = true;
    if (!current?.available_at) patch.available_at = new Date().toISOString();
  } else {
    patch.online_status = "scheduled";
    patch.active = false;
    if (!current?.scheduled_available_at) {
      patch.scheduled_available_at = input.defaultScheduledAvailableAtIso;
      patch.scheduled_by = input.uploadedBy;
    }
  }
  const { error } = await client.from(TABLE).update(patch).eq("id", editionId);
  if (error) throw new Error(error.message);
}

/**
 * Alteração manual (ou nova definição) da data/hora de disponibilização —
 * sempre por uma pessoa identificada (auditoria em `edicoes/actions.ts`).
 * Mesma proteção de `markEditionUploadedAndSchedule`: olha `active` real,
 * nunca só `online_status`.
 */
export async function scheduleEditionAvailability(
  client: SupabaseClient,
  editionId: string,
  scheduledAvailableAtIso: string,
  scheduledBy: string,
): Promise<void> {
  const { data: current, error: readError } = await client
    .from(TABLE)
    .select("online_status, active")
    .eq("id", editionId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  const patch: Record<string, unknown> = {
    scheduled_available_at: scheduledAvailableAtIso,
    scheduled_by: scheduledBy,
    online_error: null,
  };
  // Uma edição JÁ disponível (active=true ou online_status='available')
  // nunca é ocultada de novo só por uma alteração manual na data — isso
  // faria algo que o público já está lendo "desaparecer". Volta a
  // 'scheduled' (nova espera pelo cron) só quando ainda não estava
  // disponível de verdade.
  const isLive = Boolean(current?.active) || current?.online_status === "available";
  if (!isLive) {
    patch.online_status = "scheduled";
  }
  const { error } = await client.from(TABLE).update(patch).eq("id", editionId);
  if (error) throw new Error(error.message);
}

export interface MateriasStatusUpdate {
  status: "queued" | "processing" | "completed" | "partial" | "failed";
  candidateCount?: number;
  draftCount?: number;
  failedCount?: number;
  startedAt?: string;
  finishedAt?: string;
}

/** Persiste o estado da separação automática de matérias — nunca só em
 * memória/retorno de Server Action (o operador pode fechar a aba). */
export async function updateEditionMateriasStatus(
  client: SupabaseClient,
  editionId: string,
  update: MateriasStatusUpdate,
): Promise<void> {
  const patch: Record<string, unknown> = { materias_status: update.status };
  if (update.candidateCount !== undefined) patch.materias_candidate_count = update.candidateCount;
  if (update.draftCount !== undefined) patch.materias_draft_count = update.draftCount;
  if (update.failedCount !== undefined) patch.materias_failed_count = update.failedCount;
  if (update.startedAt !== undefined) patch.materias_started_at = update.startedAt;
  if (update.finishedAt !== undefined) patch.materias_finished_at = update.finishedAt;
  const { error } = await client.from(TABLE).update(patch).eq("id", editionId);
  if (error) throw new Error(error.message);
}

/** Marca o processo Jornal Online como "Atenção" com o motivo — nunca
 * apaga o PDF/capa já arquivados, só sinaliza na listagem/modal. */
export async function markEditionOnlineAttention(
  client: SupabaseClient,
  editionId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await client
    .from(TABLE)
    .update({ online_status: "attention", online_error: errorMessage.slice(0, 500) })
    .eq("id", editionId);
  if (error) throw new Error(error.message);
}

export function createNewspaperEditionRepositorySupabase(client: SupabaseClient): NewspaperEditionRepository {
  return {
    async list() {
      if (isLocalPreviewEnabled()) return PREVIEW_EDITIONS;
      const { data, error } = await client
        .from(TABLE)
        .select(COLUMNS)
        .order("publication_date", { ascending: false });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as NewspaperEditionRow[];
      const profileNames = await fetchProfileNames(
        client,
        rows.flatMap((row) => [row.uploaded_by, row.scheduled_by].filter((id): id is string => Boolean(id))),
      );
      return Promise.all(rows.map((row) => toDomain(client, row, profileNames)));
    },

    async getById(id) {
      if (isLocalPreviewEnabled()) return PREVIEW_EDITIONS.find((edition) => edition.id === id) ?? null;
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const row = data as NewspaperEditionRow;
      const profileNames = await fetchProfileNames(
        client,
        [row.uploaded_by, row.scheduled_by].filter((value): value is string => Boolean(value)),
      );
      return toDomain(client, row, profileNames);
    },

    async create(record: NewNewspaperEditionRecord) {
      const { data, error } = await client
        .from(TABLE)
        .insert({
          edition_number: record.editionNumber,
          publication_date: record.publicationDate,
          title: record.title,
          pdf_url: record.pdfUrl ?? null,
          page_count: record.pageCount ?? null,
          active: record.active,
        })
        .select(COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return toDomain(client, data as NewspaperEditionRow);
    },

    async update(id, changes: NewspaperEditionChanges) {
      const patch: Record<string, unknown> = {};
      if (changes.editionNumber !== undefined) patch.edition_number = changes.editionNumber;
      if (changes.publicationDate !== undefined) patch.publication_date = changes.publicationDate;
      if (changes.title !== undefined) patch.title = changes.title ?? null;
      if (changes.pdfUrl !== undefined) patch.pdf_url = changes.pdfUrl ?? null;
      if (changes.pageCount !== undefined) patch.page_count = changes.pageCount ?? null;
      if (changes.active !== undefined) patch.active = changes.active;

      const { data, error } = await client.from(TABLE).update(patch).eq("id", id).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      const row = data as NewspaperEditionRow;
      const profileNames = await fetchProfileNames(
        client,
        [row.uploaded_by, row.scheduled_by].filter((value): value is string => Boolean(value)),
      );
      return toDomain(client, row, profileNames);
    },
  };
}
