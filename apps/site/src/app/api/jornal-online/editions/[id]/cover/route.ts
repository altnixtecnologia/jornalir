import { handleEditionAssetRequest } from "../../../../../../lib/server/editionAssetProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  const { id } = await params;
  const url = new URL(request.url);
  return handleEditionAssetRequest({
    id,
    kind: "cover",
    method: "GET",
    rangeHeader: request.headers.get("range"),
    download: url.searchParams.get("download") === "1",
  });
}

export async function HEAD(request: Request, { params }: RouteParams): Promise<Response> {
  const { id } = await params;
  return handleEditionAssetRequest({
    id,
    kind: "cover",
    method: "HEAD",
    rangeHeader: request.headers.get("range"),
    download: false,
  });
}
