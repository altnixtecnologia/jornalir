import { handleEditionAssetRequest } from "../../../../../../lib/server/editionAssetProxy";

// SDK da AWS (R2) não roda no runtime Edge da Vercel; precisa do Node.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: { id: string };
}

export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  const url = new URL(request.url);
  return handleEditionAssetRequest({
    id: params.id,
    kind: "pdf",
    method: "GET",
    rangeHeader: request.headers.get("range"),
    download: url.searchParams.get("download") === "1",
  });
}

export async function HEAD(request: Request, { params }: RouteParams): Promise<Response> {
  return handleEditionAssetRequest({
    id: params.id,
    kind: "pdf",
    method: "HEAD",
    rangeHeader: request.headers.get("range"),
    download: false,
  });
}
