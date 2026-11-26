import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { ALTNIX_CLIENT_EXPORT_RELEASED, parseDigitalClientIds, parseDigitalSelectionPage, digitalSelectionPage, DIGITAL_CLIENT_BATCH_LIMIT, sanitizeDigitalClientSearch, toAltnixDigitalClient, type ExportableJornalClient } from "../../../../../lib/integrations/altnixDigitalClientContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function respond(payload: unknown, status = 200): NextResponse {
  return NextResponse.json(payload, {
    status, headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" },
  });
}
function secretValid(request: NextRequest): boolean {
  const configured = process.env.ALTNIX_CLIENT_SYNC_SECRET;
  if (!configured || configured.length < 32 || configured.length > 512) return false;
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
  // Piloto: somente produção, segredo exclusivo e aprovação individual.
  // A liberação de leitura não autoriza nenhuma escrita.
  if (!ALTNIX_CLIENT_EXPORT_RELEASED) {
    return respond({ error: "Integração Jornal IR–Altnix ainda não autorizada para ativação." }, 503);
  }
  if (process.env.VERCEL_ENV !== "production" || process.env.ALTNIX_CLIENT_SYNC_ENABLED !== "true") {
    return respond({ error: "Integração de clientes desativada." }, 503);
  }
  if (!secretValid(request)) return respond({ error: "Não autorizado." }, 401);
  // Descoberta somente por ação explícita do consumidor. Retorna apenas IDs
  // ativos e selecionados; detalhes continuam na API exata em lote.
  if (request.nextUrl.searchParams.has("selected") || request.nextUrl.searchParams.has("after")) {
    const page = parseDigitalSelectionPage(request.nextUrl.searchParams);
    if (!page) return respond({ error: "Página de seleção inválida." }, 400);
    try {
      const db = createSupabaseAdminClient();
      let query = db.from("clients").select("id,client_digital_export_permissions!inner(enabled)")
        .eq("client_digital_export_permissions.enabled", true).eq("status", "active");
      if (page.after) query = query.gt("id", page.after);
      const { data, error } = await query.order("id", { ascending: true }).limit(DIGITAL_CLIENT_BATCH_LIMIT + 1);
      if (error || !data) return respond({ error: "Seleção indisponível." }, 503);
      const result = digitalSelectionPage(data.map(row => row.id), page.after);
      if (!result) return respond({ error: "Seleção indisponível." }, 503);
      return respond({ source: "jornalir", mode: "readonly", selection: "altnix_informativo", ...result });
    } catch {
      return respond({ error: "Seleção indisponível." }, 503);
    }
  }
  const id = request.nextUrl.searchParams.get("id")?.trim() || "";
  const search = request.nextUrl.searchParams.get("q") || "";
  const q = sanitizeDigitalClientSearch(search);
  const rawIds = request.nextUrl.searchParams.get("ids");
  const ids = rawIds === null ? null : parseDigitalClientIds(rawIds);
  if (rawIds !== null && (!ids || request.nextUrl.searchParams.getAll("ids").length !== 1 ||
      request.nextUrl.searchParams.has("id") || request.nextUrl.searchParams.has("q"))) {
    return respond({ error: "Lote de identificadores inválido." }, 400);
  }
  if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return respond({ error: "Identificador inválido." }, 400);
  }
  if (!id && !ids && !q) return respond({ error: "Informe uma busca com 2 a 70 caracteres." }, 400);
  try {
    const db = createSupabaseAdminClient();
    // Join obrigatório com a lista expressa de cadastros autorizados.
    let query = db.from("clients").select(
      "id,kind,status,full_name,company_name,trade_name,cpf,cnpj,phone_primary,email," +
      (id || ids ? "whatsapp," : "") +
      "" +
      "address_zip,address_street,address_number,address_complement,address_city,address_state,updated_at," +
      "client_digital_export_permissions!inner(enabled)",
    ).eq("client_digital_export_permissions.enabled", true).eq("status", "active");
    if (ids) query = query.in("id", ids);
    else if (id) query = query.eq("id", id);
    else query = query.or(
      ["full_name","company_name","trade_name"].map((field) => field+".ilike.%"+q+"%").join(","),
    );
    const { data, error } = await query.order("updated_at", { ascending: false }).limit(DIGITAL_CLIENT_BATCH_LIMIT);
    if (error) {
      console.error("Altnix digital client read failed:", error.code);
      return respond({ error: "Não foi possível consultar o cadastro digital." }, 503);
    }
    const clients = (data ?? []).map((row) =>
      toAltnixDigitalClient(row as unknown as ExportableJornalClient, Boolean(id || ids)),
    ).filter((row): row is NonNullable<typeof row> => row !== null);
    // Uma resposta incompleta/malformada jamais equivale a serviço não selecionado.
    if (ids && clients.length !== (data ?? []).length) {
      return respond({ error: "Cadastro digital indisponível." }, 503);
    }
    return respond({ clients, count: clients.length, source: "jornalir", mode: "readonly",
      ...(ids ? { selection: "altnix_informativo", requestedCount: ids.length } : {}),
    });
  } catch {
    return respond({ error: "Integração indisponível." }, 503);
  }
}
