import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy same-origin só pra permitir `canvas.drawImage`/`toBlob` no editor
 * de imagem da matéria — objetos do R2 não têm CORS habilitado, então um
 * `<img>` carregado direto da URL pública do R2 "mancha" o canvas (erro de
 * segurança ao tentar ler os pixels). Não é um mecanismo de storage novo:
 * só re-serve, no mesmo domínio, um objeto que já é público no R2; por
 * isso a trava abaixo (prefixo exato de `R2_PUBLIC_BASE_URL`) existe pra
 * nunca virar um proxy aberto para qualquer URL arbitrária da internet.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl.searchParams.get("url");
  const base = process.env.R2_PUBLIC_BASE_URL;
  if (!url || !base || !url.startsWith(base.replace(/\/$/, ""))) {
    return NextResponse.json({ error: "URL de imagem inválida." }, { status: 400 });
  }

  const upstream = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Não foi possível carregar a imagem." }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "private, max-age=300",
    },
  });
}
