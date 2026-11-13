import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NfseIssuedNote } from "@ir/types";
import { extractDanfseData } from "@ir/core/src/nfse/danfse-data";
import { buildDanfsePdf } from "./danfsePdf";
import { readNfseDocument, saveNfseDocument } from "../../providers/r2/nfseDocuments.r2";

type AssetKind = "nfse_xml" | "dps_xml" | "danfse_pdf";
interface AssetRow {
  id: string; issued_note_id: string; kind: AssetKind;
  r2_key: string; sha256: string; size_bytes: number; content_type: string;
}

/** Preserva os bytes originais XML e o PDF gerado sem substituir versoes anteriores. */
export async function archiveNfseDocuments(
  admin: SupabaseClient, note: NfseIssuedNote,
): Promise<Record<AssetKind, AssetRow>> {
  if (!note.accessKey || !note.nfseXml || !note.signedDpsXml) {
    throw new Error("Nota ainda não possui XML oficial e DPS assinada. Não enviar e-mail.");
  }
  // O XML oficial continua no banco como fallback até a migração R2 ser homologada.
  const pdf = Buffer.from(await buildDanfsePdf(extractDanfseData(note)));
  const objects: Array<{ kind: AssetKind; bytes: Buffer }> = [
    { kind: "nfse_xml", bytes: Buffer.from(note.nfseXml, "utf8") },
    { kind: "dps_xml", bytes: Buffer.from(note.signedDpsXml, "utf8") },
    { kind: "danfse_pdf", bytes: pdf },
  ];
  const result = {} as Record<AssetKind, AssetRow>;
  for (const entry of objects) {
    const { data: existing, error: readError } = await admin.from("nfse_document_assets")
      .select("id,issued_note_id,kind,r2_key,sha256,size_bytes,content_type")
      .eq("issued_note_id", note.id).eq("kind", entry.kind).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (existing) {
      // A prova de integridade exige o R2; nunca usar metadados falsos.
      await readNfseDocument(existing.r2_key, existing.sha256);
      result[entry.kind] = existing as AssetRow;
      continue;
    }
    const upload = await saveNfseDocument({
      noteId: note.id, environment: note.environment, kind: entry.kind, data: entry.bytes,
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
