import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NfseIssuedNote } from "@ir/types";
import { extractDanfseData } from "@ir/core/src/nfse/danfse-data";
import { buildDanfsePdf } from "./danfsePdf";
import { readNfseDocument, saveNfseDocument } from "../../providers/r2/nfseDocuments.r2";
import { createIssuedNoteRepositorySupabase } from "../../providers/supabase/nfseIssuedNoteRepository.supabase";

type AssetKind = "nfse_xml" | "dps_xml" | "danfse_pdf";
interface AssetRow {
  id: string; issued_note_id: string; kind: AssetKind;
  r2_key: string; sha256: string; size_bytes: number; content_type: string;
}

/** Dependências externas (R2 e gerador de PDF) injetáveis para teste com mocks; o padrão usa as reais. */
export interface ArchiveDeps {
  save: typeof saveNfseDocument;
  read: typeof readNfseDocument;
  buildPdf: (note: NfseIssuedNote) => Promise<Buffer>;
}
const defaultDeps: ArchiveDeps = {
  save: saveNfseDocument,
  read: readNfseDocument,
  buildPdf: async (note) => Buffer.from(await buildDanfsePdf(extractDanfseData(note))),
};

/** Preserva os bytes originais XML e o PDF gerado sem substituir versoes anteriores. */
export async function archiveNfseDocuments(
  admin: SupabaseClient, note: NfseIssuedNote, deps: ArchiveDeps = defaultDeps,
): Promise<Record<AssetKind, AssetRow>> {
  if (!note.accessKey || !note.nfseXml || !note.signedDpsXml) {
    throw new Error("Nota ainda não possui XML oficial e DPS assinada. Não enviar e-mail.");
  }
  // Primeiro guarda o XML original; se o gerador de PDF falhar,
  // as fontes fiscais permanecem preservadas no R2.
  const objects: Array<{ kind: AssetKind; bytes: Buffer | (() => Promise<Buffer>) }> = [
    { kind: "nfse_xml", bytes: Buffer.from(note.nfseXml, "utf8") },
    { kind: "dps_xml", bytes: Buffer.from(note.signedDpsXml, "utf8") },
    { kind: "danfse_pdf", bytes: () => deps.buildPdf(note) },
  ];
  const result = {} as Record<AssetKind, AssetRow>;
  for (const entry of objects) {
    const { data: existing, error: readError } = await admin.from("nfse_document_assets")
      .select("id,issued_note_id,kind,r2_key,sha256,size_bytes,content_type")
      .eq("issued_note_id", note.id).eq("kind", entry.kind).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (existing) {
      // A prova de integridade exige o R2; nunca usar metadados falsos.
      await deps.read(existing.r2_key, existing.sha256);
      result[entry.kind] = existing as AssetRow;
      continue;
    }
    const bytes = typeof entry.bytes === "function" ? await entry.bytes() : entry.bytes;
    const upload = await deps.save({
      noteId: note.id, environment: note.environment, kind: entry.kind, data: bytes,
    });
    const { data, error } = await admin.from("nfse_document_assets").insert({
      issued_note_id: note.id, kind: entry.kind,
      r2_key: upload.key, sha256: upload.sha256, size_bytes: upload.sizeBytes,
      content_type: upload.contentType,
    }).select("id,issued_note_id,kind,r2_key,sha256,size_bytes,content_type").single();
    if (error) {
      // Outro worker pode ter inserido entre o SELECT e o INSERT.
      const raced = await admin.from("nfse_document_assets")
        .select("id,issued_note_id,kind,r2_key,sha256,size_bytes,content_type")
        .eq("issued_note_id", note.id).eq("kind", entry.kind).maybeSingle();
      if (raced.error || !raced.data || raced.data.sha256 !== upload.sha256) throw new Error(error.message);
      result[entry.kind] = raced.data as AssetRow;
    } else {
      result[entry.kind] = data as AssetRow;
    }
  }
  return result;
}

/**
 * A busca e claim acontecem no PostgreSQL, sobre TODAS as notas elegiveis.
 * O banco controla a janela de 3 minutos e o backoff por nota, de forma
 * persistente entre invocacoes serverless e segura para cron concorrente.
 * Requer migration D (20261122340900), ainda NAO aplicada em producao.
 */
export interface ArchiveBatchOptions {
  limit?: number;
  deps?: ArchiveDeps;
  loadNote?: (id: string) => Promise<NfseIssuedNote | null>;
  claim?: (admin: SupabaseClient, limit: number) => Promise<string[]>;
  defer?: (admin: SupabaseClient, id: string) => Promise<void>;
}
async function claimArchiveCandidates(admin: SupabaseClient, limit: number): Promise<string[]> {
  const { data, error } = await admin.rpc("claim_pending_nfse_archive", { p_limit: limit });
  if (error) throw new Error("Fila de arquivamento fiscal indisponivel (migration D pendente ou erro no banco).");
  return ((data ?? []) as Array<{ issued_note_id: string }>).map((row) => row.issued_note_id);
}
async function deferArchiveFailure(admin: SupabaseClient, id: string): Promise<void> {
  const { error } = await admin.rpc("defer_nfse_archive_failure", { p_note_id: id });
  if (error) throw new Error("Nao foi possivel registrar a retentativa do arquivamento.");
}

/**
 * Faz claim atomico no banco de ate 3 notas autorizadas ainda sem os documentos,
 * sem limitar a busca as mais recentes. Erros sao adiados com backoff persistente:
 * nao monopolizam os proximos lotes e nunca provocam reenvio automatico de e-mail.
 */
export async function archivePendingNfseNotes(
  admin: SupabaseClient,
  opts: ArchiveBatchOptions = {},
): Promise<{ archived: number; failed: number; claimed: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 3, 1), 10);
  const loadNote = opts.loadNote ?? ((id: string) => createIssuedNoteRepositorySupabase(admin).getById(id));
  const ids = await (opts.claim ?? claimArchiveCandidates)(admin, limit);
  let archived = 0, failed = 0;
  for (const id of ids) {
    try {
      const note = await loadNote(id);
      if (!note) throw new Error("NFS-e nao encontrada no claim de arquivamento.");
      await archiveNfseDocuments(admin, note, opts.deps);
      archived++;
    } catch {
      // A falha de uma nota nao prejudica outras; a proxima tentativa
      // respeita backoff. Se nao puder registrar o backoff, o cron falha
      // de forma visivel em vez de declarar que concluiu o lote.
      await (opts.defer ?? deferArchiveFailure)(admin, id);
      failed++;
    }
  }
  return { archived, failed, claimed: ids.length };
}
