import { handleEditionPdfProxyRequest } from "../../../../../../../lib/editorial/editionPdfProxy";

// SDK da AWS (R2) não roda no runtime Edge da Vercel; precisa do Node.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, props: RouteParams): Promise<Response> {
  const params = await props.params;
  return handleEditionPdfProxyRequest({
    editionId: params.id,
    method: "GET",
    rangeHeader: request.headers.get("range"),
  });
}

export async function HEAD(request: Request, props: RouteParams): Promise<Response> {
  const params = await props.params;
  return handleEditionPdfProxyRequest({
    editionId: params.id,
    method: "HEAD",
    rangeHeader: request.headers.get("range"),
  });
}
