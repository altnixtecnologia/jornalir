import { NextResponse } from "next/server";
import { checkModuleAction } from "../../../../lib/permissions/checkModuleAction";
import { buildDanfsePdf } from "../../../../lib/nfse/danfsePdf";
import { DANFSE_PREVIEW_FIXTURE } from "../../../../lib/nfse/danfsePreviewFixture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Apenas preview visual, administrativo, usando dados ficticios fixos.
 * Nao recebe ID de nota, corpo ou parametros fiscais do navegador.
 * Nao acessa banco para dados fiscais, SEFIN, certificado, R2 ou e-mail.
 * A permissao ja revalida usuario owner/admin ativo na preparacao oficial.
 * Nunca relaxar o gate do DANFSe oficial por causa desta rota.
 */
export async function GET(): Promise<NextResponse> {
  const permissionError = await checkModuleAction("nfse", "configuracoes_gerenciar");
  if (permissionError) {
    return NextResponse.json({ error: permissionError }, {
      status: 403,
      headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
    });
  }

  try {
    const pdf = await buildDanfsePdf(DANFSE_PREVIEW_FIXTURE);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="DANFSe-PREVIA-FICTICIA.pdf"',
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch {
    return NextResponse.json({
      error: "Nao foi possivel gerar o PDF ficticio. A emissao fiscal permanece desabilitada.",
    }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
    });
  }
}
