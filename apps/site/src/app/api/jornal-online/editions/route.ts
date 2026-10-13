import { NextResponse } from "next/server";
import { getPublicSupabaseClient } from "../../../../lib/public/supabasePublicClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function dateLabel(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}

export async function GET(): Promise<Response> {
  try {
    const client = getPublicSupabaseClient();
    const { data, error } = await client
      .from("newspaper_editions")
      .select("id, edition_number, publication_date, title, pdf_url, cover_url, page_count, archive_provider")
      .eq("active", true)
      .not("pdf_url", "is", null)
      .order("publication_date", { ascending: false })
      .order("edition_number", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json(
      {
        ok: true,
        items: (data ?? []).map((row) => ({
          id: row.id,
          title: row.title || `Edição ${row.edition_number}`,
          dateLabel: dateLabel(row.publication_date),
          publicationDate: row.publication_date,
          category: `Edição ${row.edition_number}`,
          editionNumber: row.edition_number,
          pdfPath: row.pdf_url,
          sourceUrl: row.pdf_url,
          coverUrl: row.cover_url,
          pageCount: row.page_count ?? undefined,
          archiveProvider: row.archive_provider ?? "external",
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Não foi possível carregar o acervo.",
        items: [],
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
