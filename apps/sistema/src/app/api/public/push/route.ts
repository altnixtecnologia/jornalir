import "server-only";
import { createHash, createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function allowedOrigins(): Set<string> {
  const configured = (process.env.PUSH_ALLOWED_SITE_ORIGINS || "").split(/[,;\s]+/).filter(Boolean);
  return new Set(["https://jornalir.vercel.app", ...configured].map((value) => {
    try { return new URL(value).origin; } catch { return ""; }
  }).filter(Boolean));
}
export function corsOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  return origin && allowedOrigins().has(origin) ? origin : null;
}
export function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}
function json(data: unknown, status: number, origin: string): NextResponse {
  return NextResponse.json(data, { status, headers: corsHeaders(origin) });
}
function validSubscription(value: unknown): value is { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (!value || typeof value !== "object") return false;
  const sub = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof sub.endpoint !== "string" || sub.endpoint.length > 1500 || sub.endpoint.length < 40) return false;
  let url: URL;
  try { url = new URL(sub.endpoint); } catch { return false; }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  if (!(
    hostname === "fcm.googleapis.com" ||
    hostname === "updates.push.services.mozilla.com" ||
    hostname === "web.push.apple.com" ||
    hostname.endsWith(".push.apple.com") ||
    hostname.endsWith(".notify.windows.com")
  )) return false;
  if (typeof sub.keys?.p256dh !== "string" || typeof sub.keys?.auth !== "string") return false;
  if (!/^[a-zA-Z0-9_-]+$/.test(sub.keys.p256dh) || !/^[a-zA-Z0-9_-]+$/.test(sub.keys.auth)) return false;
  const pub = Buffer.from(sub.keys.p256dh, "base64url");
  const auth = Buffer.from(sub.keys.auth, "base64url");
  return pub.length === 65 && pub[0] === 4 && auth.length >= 16 && auth.length <= 32;
}
function validToken(token: unknown): token is string {
  return typeof token === "string" && /^[a-zA-Z0-9_-]{32,128}$/.test(token);
}
async function parseBody(request: NextRequest): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > 6000) throw new Error("Tamanho excedido");
  const body: unknown = JSON.parse(raw);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Corpo inválido");
  return body as Record<string, unknown>;
}
function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Servidor não configurado");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const origin = corsOrigin(request);
  if (!origin) return NextResponse.json({ error: "Origem não permitida" }, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}
export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = corsOrigin(request);
  if (!origin) return NextResponse.json({ error: "Origem não permitida" }, { status: 403 });
  const key = process.env.PUSH_VAPID_PUBLIC_KEY || "";
  return json({ configured: Boolean(key), publicKey: key }, 200, origin);
}
export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = corsOrigin(request);
  if (!origin) return NextResponse.json({ error: "Origem não permitida" }, { status: 403 });
  const rateSecret = process.env.CRON_SECRET;
  if (!rateSecret || !process.env.PUSH_VAPID_PUBLIC_KEY) return json({ error: "Envio de notificações indisponível" }, 503, origin);
  try {
    const data = await parseBody(request);
    if (!validSubscription(data.subscription) || !validToken(data.managementToken)) return json({ error: "Assinatura inválida" }, 400, origin);
    if (typeof data.ordinary !== "boolean" || typeof data.urgent !== "boolean" || (!data.ordinary && !data.urgent)) return json({ error: "Selecione ao menos um tipo de notícia" }, 400, origin);
    const token = data.managementToken;
    const subscription = data.subscription;
    const ip = request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ipHash = createHmac("sha256", rateSecret).update("site-push-registration:" + ip).digest("hex");
    const db = service();
    const claimed = await db.rpc("claim_site_push_registration", { p_client_hash: ipHash });
    if (claimed.error || claimed.data !== true) return json({ error: "Muitas tentativas. Tente mais tarde." }, 429, origin);
    const managementHash = createHash("sha256").update("site-push:" + token).digest("hex");
    const { data: existing, error: readError } = await db.from("site_push_subscriptions")
      .select("id,management_hash").eq("endpoint", subscription.endpoint).maybeSingle();
    if (readError) return json({ error: "Não foi possível verificar o cadastro" }, 500, origin);
    if (existing && existing.management_hash !== managementHash) return json({ error: "Assinatura já vinculada a outro cadastro neste navegador" }, 409, origin);
    const platform = data.platform === "android" || data.platform === "ios" ? data.platform : "web";
    const row = {
      endpoint: subscription.endpoint, subscription_payload: subscription,
      management_hash: managementHash,
      ordinary_enabled: data.ordinary, urgent_enabled: data.urgent,
      enabled: true, platform, updated_at: new Date().toISOString(),
    };
    const saved = existing
      ? await db.from("site_push_subscriptions").update(row).eq("id", existing.id)
      : await db.from("site_push_subscriptions").insert(row);
    if (saved.error) return json({ error: "Não foi possível registrar o dispositivo" }, 500, origin);
    return json({ ok: true }, 200, origin);
  } catch {
    return json({ error: "Não foi possível registrar o dispositivo" }, 400, origin);
  }
}
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const origin = corsOrigin(request);
  if (!origin) return NextResponse.json({ error: "Origem não permitida" }, { status: 403 });
  try {
    const body = await parseBody(request);
    if (!validToken(body.managementToken) || typeof body.endpoint !== "string") return json({ error: "Dados inválidos" }, 400, origin);
    const managementHash = createHash("sha256").update("site-push:" + body.managementToken).digest("hex");
    const db = service();
    const { error } = await db.from("site_push_subscriptions").update({
      enabled: false, ordinary_enabled: false, urgent_enabled: false, updated_at: new Date().toISOString(),
    }).eq("endpoint", body.endpoint).eq("management_hash", managementHash);
    if (error) return json({ error: "Não foi possível desativar" }, 500, origin);
    return json({ ok: true }, 200, origin);
  } catch {
    return json({ error: "Não foi possível desativar" }, 400, origin);
  }
}
