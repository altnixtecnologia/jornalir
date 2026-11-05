import { NextResponse } from "next/server";
import { getPublicSupabaseClient } from "../../../../lib/public/supabasePublicClient";
import { mapEditionRow, type NewspaperEditionRow } from "../../../../lib/public/editionListMapping";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<Response> {
  try {
    const client = getPublicSupabaseClient();
    const { data, error } = await client
      .from("newspaper_editions")
      .select(
        "id, edition_number, publication_date, title, pdf_url, cover_url, page_count, archive_provider, pdf_r2_key, cover_r2_key",
      )
      .eq("active", true)
      // Uma edição do acervo R2 pode não ter pdf_url externo preenchido —
      // nesse caso ela é servida pela rota de proxy (pdf_r2_key) e não pode
      // desaparecer da listagem só por faltar a URL legada.
      .or("pdf_url.not.is.null,pdf_r2_key.not.is.null")
      .order("publication_date", { ascending: false })
      .order("edition_number", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json(
      { ok: true, items: ((data ?? []) as NewspaperEditionRow[]).map(mapEditionRow) },
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
