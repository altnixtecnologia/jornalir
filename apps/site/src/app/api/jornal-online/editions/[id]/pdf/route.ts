import { handleEditionAssetRequest } from "../../../../../../lib/server/editionAssetProxy";

// SDK da AWS (R2) não roda no runtime Edge da Vercel; precisa do Node.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, props: RouteParams): Promise<Response> {
  const params = await props.params;
  const url = new URL(request.url);
  return handleEditionAssetRequest({
    id: params.id,
    kind: "pdf",
    method: "GET",
    rangeHeader: request.headers.get("range"),
    download: url.searchParams.get("download") === "1",
  });
}

export async function HEAD(request: Request, props: RouteParams): Promise<Response> {
  const params = await props.params;
  return handleEditionAssetRequest({
    id: params.id,
    kind: "pdf",
    method: "HEAD",
    rangeHeader: request.headers.get("range"),
    download: false,
  });
}
