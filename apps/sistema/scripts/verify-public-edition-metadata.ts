/**
 * Verificação independente de PDFs JÁ PUBLICADOS pelo próprio portal.
 * Não acessa credenciais R2, não lê/edita Supabase, não altera acervo.
 * Útil para validar a amostra do backfill histórico por GitHub Actions.
 *
 * Exemplo:
 *   npx tsx scripts/verify-public-edition-metadata.ts --numbers=776,775,774
 *
 * Não usar para edições em preparação ou ainda não liberadas ao público.
 */
import { loadPdfDocument } from "@ir/pdf-extraction";
import { sha256OfArchivePdf } from "../src/lib/editorial/editionArchiveMetadata";

const SITE_ORIGIN = "https://jornalir.vercel.app";
const MAX_BYTES = 45 * 1024 * 1024; // evita baixar um arquivo atípico gigantesco
const MAX_EDITIONS = 3;

type PublicEdition = {
  id: string;
  editionNumber: number;
  pdfPath: string | null;
  archiveProvider: string;
};
type PublicResponse = { ok: boolean; items?: PublicEdition[] };

function numbersArgument(): number[] {
  const raw = process.argv.find((a) => a.startsWith("--numbers="))?.slice("--numbers=".length) ?? "776,775,774";
  if (!/^\d{1,4}(,\d{1,4})*$/.test(raw)) throw new Error("Lista de edições inválida.");
  const numbers = raw.split(",").map(Number);
  if (!numbers.length || numbers.length > MAX_EDITIONS || new Set(numbers).size !== numbers.length) {
    throw new Error("Informe de uma a três edições diferentes.");
  }
  return numbers;
}

async function fetchPublicPdf(item: PublicEdition): Promise<{ size: number; sha256: string; pages: number }> {
  // Impedir qualquer URL arbitrária: só rota oficial por UUID do acervo publicado.
  if (item.archiveProvider !== "r2" ||
    !/^[a-f0-9-]{36}$/i.test(item.id) ||
    item.pdfPath !== `/api/jornal-online/editions/${item.id}/pdf`) {
    throw new Error(`Edição ${item.editionNumber} não possui PDF público R2 esperado.`);
  }
  const response = await fetch(`${SITE_ORIGIN}${item.pdfPath}`, {
    redirect: "error",
    headers: { Accept: "application/pdf" },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok || !(response.headers.get("content-type") ?? "").startsWith("application/pdf")) {
    throw new Error(`Edição ${item.editionNumber}: HTTP ${response.status} ou Content-Type inesperado.`);
  }
  const reportedLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(reportedLength) && reportedLength > MAX_BYTES) {
    await response.body?.cancel();
    throw new Error(`Edição ${item.editionNumber}: PDF maior que o limite de verificação.`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 5 || bytes.length > MAX_BYTES ||
      new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw new Error(`Edição ${item.editionNumber}: arquivo inválido ou tamanho fora do limite.`);
  }
  if (reportedLength > 0 && reportedLength !== bytes.length) {
    throw new Error(`Edição ${item.editionNumber}: Content-Length divergente.`);
  }
  const sha256 = sha256OfArchivePdf(bytes);
  const document = await loadPdfDocument(bytes);
  let pages: number;
  try {
    pages = document.numPages;
  } finally {
    await document.destroy();
  }
  if (!Number.isInteger(pages) || pages <= 0) throw new Error("Quantidade de páginas inválida.");
  return { size: bytes.length, sha256, pages };
}

async function main(): Promise<void> {
  const requestedNumbers = numbersArgument();
  // Sem autenticação: a listagem pública já omite edições em preparação,
  // agendadas, inativas ou sem available_at.
  const response = await fetch(`${SITE_ORIGIN}/api/jornal-online/editions`, {
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Catálogo indisponível (HTTP ${response.status}).`);
  const list = await response.json() as PublicResponse;
  if (!list.ok || !Array.isArray(list.items)) throw new Error("Catálogo inválido.");
  const output: Array<{ edition: number; id: string; bytes: number; pages: number; sha256: string }> = [];
  for (const edition of requestedNumbers) {
    const item = list.items.find((e) => e.editionNumber === edition);
    if (!item) throw new Error(`Edição ${edition} não está liberada; não tentar acessá-la diretamente.`);
    const result = await fetchPublicPdf(item);
    output.push({ edition, id: item.id, bytes: result.size, pages: result.pages, sha256: result.sha256 });
    console.log(`IR_METADATA_VERIFY_RESULT ${JSON.stringify(output[output.length - 1])}`);
  }
  console.log(`[verificação] ${output.length} PDF(s) reais lidos pelo portal público; nenhuma gravação feita.`);
}

main().catch((error) => {
  // Não exibir stack com dados de requisição.
  console.error("[verificação] Falha:", error instanceof Error ? error.message : "erro desconhecido");
  process.exitCode = 1;
});
