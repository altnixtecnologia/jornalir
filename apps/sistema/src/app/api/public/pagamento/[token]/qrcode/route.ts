import { createSupabaseAdminClient } from "../../../../../../lib/supabase/admin";
import { getAsaasPixQrCodeData } from "../../../../../../lib/financeiro/asaasPixProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function base64Body(value: string): Buffer {
  const normalized = value.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  return Buffer.from(normalized, "base64");
}

export async function GET(
  _request: Request,
  { params }: { params: { token: string } },
): Promise<Response> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("payment_charges")
    .select("provider, provider_charge_id, status")
    .eq("public_token", params.token)
    .maybeSingle();

  if (error) return new Response("Não foi possível carregar a cobrança.", { status: 500 });
  if (!data || data.provider !== "asaas" || !data.provider_charge_id) {
    return new Response("QR Code não encontrado.", { status: 404 });
  }
  if (data.status === "cancelled") {
    return new Response("Cobrança cancelada.", { status: 410 });
  }

  try {
    const qr = await getAsaasPixQrCodeData(admin, data.provider_charge_id);
    if (!qr.encodedImage) return new Response("QR Code indisponível.", { status: 404 });
    const body = base64Body(qr.encodedImage);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch {
    return new Response("QR Code indisponível.", { status: 404 });
  }
}
