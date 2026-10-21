import "server-only";
import { createHash, createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { corsOrigin, corsHeaders, corsJson as reply } from "../../../../lib/publicApi/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INSTALLATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANAGEMENT_TOKEN = /^[a-zA-Z0-9_-]{32,128}$/;
const FCM_TOKEN = /^[a-zA-Z0-9:_-]{40,4096}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dbClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Banco de dados não configurado");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

async function bodyObject(request: NextRequest): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("É necessário enviar JSON");
  }
  const raw = await request.text();
  if (raw.length > 6000) throw new Error("Dados muito extensos");
  const result: unknown = JSON.parse(raw);
  if (typeof result !== "object" || !result || Array.isArray(result)) throw new Error("Dados inválidos");
  return result as Record<string, unknown>;
}

function hashManagement(id: string, token: string): string {
  // Segredo local com entropia >= 256 bits: hash unidirecional estável mesmo
  // quando CRON_SECRET for rotacionado (evita perder o vínculo dos aparelhos).
  return createHash("sha256").update("native-push:" + id + ":" + token).digest("hex");
}
function hashFcm(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
function validIdentity(data: Record<string, unknown>): data is Record<string, unknown> & {
  installationId: string; managementToken: string;
} {
  return typeof data.installationId === "string" && INSTALLATION_ID.test(data.installationId) &&
    typeof data.managementToken === "string" && MANAGEMENT_TOKEN.test(data.managementToken);
}
function clientIp(request: NextRequest): string {
  return (request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim().slice(0, 128);
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const origin = corsOrigin(request);
  if (!origin) return NextResponse.json({ error: "Origem não autorizada" }, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

/** Status apenas informativo. A disponibilidade real do push depende da
 * integração FCM no APK, das inscrições e do serviço de envio habilitado. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = corsOrigin(request);
  if (!origin) return NextResponse.json({ error: "Origem não autorizada" }, { status: 403 });
  const result = await dbClient().from("localities")
    .select("id,name,state_code").eq("scope","city").eq("active",true).order("name");
  return reply({
    platform: "android",
    registrationAvailable: process.env.NATIVE_FCM_REGISTRATION_ENABLED === "true",
    deliveryEnabled: process.env.NATIVE_FCM_DELIVERY_ENABLED === "true",
    cities: result.error ? [] : (result.data || []).filter((row) => Boolean(row.state_code))
      .map((row) => ({ id: row.id, name: row.name, stateCode: row.state_code })),
  }, 200, origin);
}

/** Chamado somente após a permissão do Android e consentimento explícito do
 * leitor. `managementToken` é gerado e persistido no aparelho; nunca é
 * devolvido pelo backend, registrado em logs ou incluído numa URL. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = corsOrigin(request);
  if (!origin) return NextResponse.json({ error: "Origem não autorizada" }, { status: 403 });
  if (process.env.NATIVE_FCM_REGISTRATION_ENABLED !== "true") {
    return reply({ error: "Cadastro de notificações Android ainda em homologação." }, 503, origin);
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) return reply({ error: "Cadastro temporariamente indisponível." }, 503, origin);
  try {
    const data = await bodyObject(request);
    if (!validIdentity(data) || data.platform !== "android" || typeof data.fcmToken !== "string" ||
        !FCM_TOKEN.test(data.fcmToken) || typeof data.ordinary !== "boolean" ||
        typeof data.urgent !== "boolean" || data.consented !== true) {
      return reply({ error: "Dados ou autorização do aparelho inválidos." }, 400, origin);
    }
    if (!data.ordinary && !data.urgent) {
      return reply({ error: "Ative ao menos um tipo de aviso ou use a opção Desativar." }, 400, origin);
    }
    // Quem já havia ativado push permanece no modo "todas" até escolher cidades.
    const geoMode = data.geoMode === "selected" ? "selected" : "all";
    const cityIds = geoMode === "selected" ? data.cityIds : [];
    if (!Array.isArray(cityIds) || (geoMode === "selected" && (cityIds.length === 0 || cityIds.length > 100)) ||
        cityIds.some((value) => typeof value !== "string" || !UUID.test(value)) ||
        new Set(cityIds).size !== cityIds.length) {
      return reply({ error: "Selecione uma ou mais cidades válidas." }, 400, origin);
    }
    const db = dbClient();
    if (geoMode === "selected") {
      const { data: validCities, error: cityError } = await db.from("localities")
        .select("id").eq("scope", "city").eq("active", true).in("id", cityIds as string[]);
      if (cityError || validCities?.length !== cityIds.length) {
        return reply({ error: "Uma ou mais cidades não estão disponíveis." }, 400, origin);
      }
    }
    const ipHash = createHmac("sha256", secret).update("native-push-rate:" + clientIp(request)).digest("hex");
    const rate = await db.rpc("claim_native_push_registration", { p_client_hash: ipHash });
    if (rate.error) return reply({ error: "Estrutura de inscrições Android ainda não instalada." }, 503, origin);
    if (rate.data !== true) return reply({ error: "Muitas tentativas. Tente novamente mais tarde." }, 429, origin);

    const managementHash = hashManagement(data.installationId, data.managementToken);
    const fcmTokenHash = hashFcm(data.fcmToken);
    const [byId, byToken] = await Promise.all([
      db.from("native_push_devices").select("id,management_hash,enabled").eq("installation_id", data.installationId).maybeSingle(),
      db.from("native_push_devices").select("id,installation_id").eq("fcm_token_hash", fcmTokenHash).maybeSingle(),
    ]);
    if (byId.error || byToken.error) return reply({ error: "Não foi possível consultar o cadastro do aparelho." }, 500, origin);
    if (byId.data && byId.data.management_hash !== managementHash) return reply({ error: "Instalação já registrada com outra credencial local." }, 409, origin);
    if (byToken.data && byToken.data.installation_id !== data.installationId) return reply({ error: "Esta instalação FCM já pertence a outro cadastro." }, 409, origin);

    const now = new Date().toISOString();
    const row = {
      installation_id: data.installationId,
      management_hash: managementHash,
      fcm_token: data.fcmToken,
      fcm_token_hash: fcmTokenHash,
      platform: "android",
      ordinary_enabled: data.ordinary,
      urgent_enabled: data.urgent,
      geo_mode: geoMode,
      geo_city_ids: cityIds,
      enabled: true,
      last_seen_at: now,
      updated_at: now,
      ...(!byId.data || !byId.data.enabled ? { consented_at: now } : {}),
    };
    const save = byId.data
      ? await db.from("native_push_devices").update(row).eq("id", byId.data.id).eq("management_hash", managementHash)
      : await db.from("native_push_devices").insert(row);
    if (save.error) {
      if (save.error.code === "23505") return reply({ error: "Cadastro concorrente: tente novamente." }, 409, origin);
      return reply({ error: "Falha ao registrar o aparelho para notificações." }, 500, origin);
    }
    return reply({ ok: true, subscribed: true, ordinary: data.ordinary, urgent: data.urgent, geoMode, cityIds }, 200, origin);
  } catch {
    return reply({ error: "Não foi possível registrar este aparelho." }, 400, origin);
  }
}

/** Desativação preserva a auditoria da entrega e impede envios futuros. */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const origin = corsOrigin(request);
  if (!origin) return NextResponse.json({ error: "Origem não autorizada" }, { status: 403 });
  if (process.env.NATIVE_FCM_REGISTRATION_ENABLED !== "true") {
    return reply({ error: "Cadastro Android indisponível nesta versão." }, 503, origin);
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) return reply({ error: "Cadastro temporariamente indisponível." }, 503, origin);
  try {
    const data = await bodyObject(request);
    if (!validIdentity(data)) return reply({ error: "Identificador local inválido." }, 400, origin);
    const db = dbClient();
    const { data: rows, error } = await db.from("native_push_devices").update({
      enabled: false, ordinary_enabled: false, urgent_enabled: false, updated_at: new Date().toISOString(),
    }).eq("installation_id", data.installationId)
      .eq("management_hash", hashManagement(data.installationId, data.managementToken))
      .select("id");
    if (error) return reply({ error: "Falha ao desativar este aparelho." }, 500, origin);
    if (!rows?.length) return reply({ error: "Instalação não encontrada ou não autorizada." }, 404, origin);
    return reply({ ok: true, subscribed: false }, 200, origin);
  } catch {
    return reply({ error: "Não foi possível desativar o cadastro." }, 400, origin);
  }
}
