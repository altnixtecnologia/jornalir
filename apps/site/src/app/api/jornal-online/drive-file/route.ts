import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "Parâmetro id é obrigatório." }, { status: 400 });
  }

  const url = `https://drive.google.com/uc?export=download&id=${id}`;

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ ok: false, error: "Falha ao baixar PDF do Drive." }, { status: 502 });
    }

    const contentType = response.headers.get("content-type") ?? "application/pdf";
    const buffer = await response.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Erro ao buscar arquivo no Drive." }, { status: 500 });
  }
}

