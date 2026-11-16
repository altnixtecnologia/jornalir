import { NextResponse } from "next/server";
import {
  municipalityLabels, type IbgeMunicipality,
} from "../../../../features/aniversariantes/municipalityAutocomplete";

/**
 * Catálogo de municípios do IBGE. O servidor atualiza a cada 7 dias,
 * e o cliente recebe apenas o nome e a UF (sem microrregiões ou perfis).
 * Endpoint não altera o banco, não usa Supabase e não coleta dados pessoais.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const result = await fetch(
      "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado",
      { next: { revalidate: 604800 }, signal: AbortSignal.timeout(12000) },
    );
    if (!result.ok) throw new Error("IBGE indisponível");
    const data: unknown = await result.json();
    if (!Array.isArray(data)) throw new Error("Resposta do IBGE inválida");
    const cities = municipalityLabels(data as IbgeMunicipality[]);
    // Não tratar falha parcial do provedor como catálogo nacional completo.
    if (cities.length < 5000) throw new Error("Lista do IBGE incompleta");
    return NextResponse.json({ cities }, {
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar a lista de municípios do IBGE." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
