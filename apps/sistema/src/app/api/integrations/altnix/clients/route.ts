import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { ALTNIX_CLIENT_EXPORT_RELEASED, sanitizeDigitalClientSearch, toAltnixDigitalClient, type ExportableJornalClient } from "../../../../../lib/integrations/altnixDigitalClientContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function respond(payload: unknown, status = 200): NextResponse {
  return NextResponse.json(payload, {
    status, headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" },
  });
}
function secretValid(request: NextRequest): boolean {
  const configured = process.env.ALTNIX_CLIENT_SYNC_SECRET;
  if (!configured || configured.length < 32) return false;
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const supplied = auth.slice(7);
  if (!supplied || supplied.length > 512) return false;
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(configured).digest();
  return timingSafeEqual(a, b);
}
/** Consulta exclusivamente autenticada servidor-a-servidor; sem service
 * key no browser. Disponível só após ativação manual em ambiente homologado.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Este bloqueio exige mudança de código deliberada em release futuro.
  // Nem segredo válido nem variável de ambiente podem ligar a integração
  // acidentalmente antes da homologação e do aval do proprietário.
  if (!ALTNIX_CLIENT_EXPORT_RELEASED) {
    return respond({ error: "Integração Jornal IR–Altnix ainda não autorizada para ativação." }, 503);
  }
  if (process.env.ALTNIX_CLIENT_SYNC_ENABLED !== "true") {
    return respond({ error: "Integração de clientes desativada." }, 503);
  }
  if (!secretValid(request)) return respond({ error: "Não autorizado." }, 401);
  const id = request.nextUrl.searchParams.get("id")?.trim() || "";
  const search = request.nextUrl.searchParams.get("q") || "";
  const q = sanitizeDigitalClientSearch(search);
  if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return respond({ error: "Identificador inválido." }, 400);
  }
  if (!id && !q) return respond({ error: "Informe uma busca com 2 a 70 caracteres." }, 400);
  try {
    const db = createSupabaseAdminClient();
    // Join obrigatório com a lista expressa de cadastros autorizados.
    let query = db.from("clients").select(
      "id,kind,status,full_name,company_name,trade_name,cpf,cnpj,phone_primary,email," +
      "address_zip,address_street,address_number,address_complement,address_city,address_state,updated_at," +
      "client_digital_export_permissions!inner(enabled)",
    ).eq("client_digital_export_permissions.enabled", true).eq("status", "active");
    if (id) query = query.eq("id", id);
    else query = query.or(
      ["full_name","company_name","trade_name"].map((field) => field+".ilike.%"+q+"%").join(","),
    );
    const { data, error } = await query.order("updated_at", { ascending: false }).limit(20);
    if (error) {
      console.error("Altnix digital client read failed:", error.code);
      return respond({ error: "Não foi possível consultar o cadastro digital." }, 503);
    }
    const clients = (data ?? []).map((row) =>
      toAltnixDigitalClient(row as unknown as ExportableJornalClient),
    ).filter((row): row is NonNullable<typeof row> => row !== null);
    return respond({ clients, count: clients.length, source: "jornalir", mode: "readonly" });
  } catch {
    return respond({ error: "Integração indisponível." }, 503);
  }
}
