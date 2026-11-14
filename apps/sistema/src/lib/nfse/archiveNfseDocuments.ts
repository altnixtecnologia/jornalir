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

const REQUIRED_KINDS: AssetKind[] = ["nfse_xml", "dps_xml", "danfse_pdf"];

/**
 * Arquiva no R2 as NFS-e de PRODUÇÃO já autorizadas que ainda não têm os três documentos, SEM depender de e-mail
 * (nem de fila de entrega). Idempotente: archiveNfseDocuments nunca sobrescreve e confere a integridade do que já existe.
 * Uma falha numa nota (R2 fora, PDF) não interrompe as demais e nunca altera a nota fiscal. Sem credenciais em mensagens.
 */
export async function archivePendingNfseNotes(
  admin: SupabaseClient,
  opts: {
    limit?: number; scan?: number; deps?: ArchiveDeps;
    loadNote?: (id: string) => Promise<NfseIssuedNote | null>;
  } = {},
): Promise<{ archived: number; failed: number; pending: number }> {
  const limit = opts.limit ?? 3;
  const loadNote = opts.loadNote ?? ((id: string) => createIssuedNoteRepositorySupabase(admin).getById(id));
  const { data: notes, error } = await admin.from("nfse_issued_notes").select("id")
    .eq("environment", "production").not("access_key", "is", null).not("nfse_xml", "is", null)
    .order("created_at", { ascending: false }).limit(opts.scan ?? 50);
  if (error) throw new Error(error.message);
  const ids = (notes ?? []).map((n: { id: string }) => n.id);
  if (!ids.length) return { archived: 0, failed: 0, pending: 0 };
  const { data: assets, error: assetError } = await admin.from("nfse_document_assets")
    .select("issued_note_id,kind").in("issued_note_id", ids);
  if (assetError) throw new Error(assetError.message);
  const have = new Map<string, Set<string>>();
  for (const a of (assets ?? []) as Array<{ issued_note_id: string; kind: string }>) {
    if (!have.has(a.issued_note_id)) have.set(a.issued_note_id, new Set());
    have.get(a.issued_note_id)!.add(a.kind);
  }
  const missing = ids.filter((id: string) => REQUIRED_KINDS.some((k) => !have.get(id)?.has(k)));
  let archived = 0, failed = 0;
  for (const id of missing.slice(0, limit)) {
    try {
      const note = await loadNote(id);
      if (!note) { failed++; continue; }
      await archiveNfseDocuments(admin, note, opts.deps);
      archived++;
    } catch { failed++; }
  }
  return { archived, failed, pending: Math.max(0, missing.length - limit) };
}
