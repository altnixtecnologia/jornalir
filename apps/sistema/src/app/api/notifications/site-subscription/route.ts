import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// As inscrições editoriais não exigem conta; toda escrita permanece no
// servidor, limitada a origens aprovadas. Nenhuma chave privada vai ao site.
function allowedOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const allow = (process.env.PUSH_ALLOWED_SITE_ORIGINS || "")
    .split(/[\s,;]+/).map(value => value.trim()).filter(Boolean);
  return allow.includes(origin) ? origin : null;
}
function cors(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
}
function errorResponse(message: string, status: number, origin: string): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: cors(origin) });
}
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}
function endpointValue(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || value.length < 25) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const permitted = host === "fcm.googleapis.com"
      || host === "updates.push.services.mozilla.com"
      || host === "web.push.apple.com"
      || host === "webpush.push.apple.com"
      || host === "wns.notify.windows.com"
      || (host.endsWith(".notify.windows.com") && host.length > ".notify.windows.com".length);
    if (!permitted || url.protocol !== "https:" || url.username || url.password || url.hash || (url.port && url.port !== "443")) return null;
    return url.toString();
  } catch { return null; }
}
function keyValue(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);
}
export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const origin = allowedOrigin(request);
  if (!origin) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: cors(origin) });
}
export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = allowedOrigin(request);
  if (!origin) return new NextResponse(null, { status: 403 });
  const publicKey = process.env.PUSH_VAPID_PUBLIC_KEY;
  if (!publicKey) return errorResponse("Push indisponível.", 503, origin);
  return NextResponse.json({ publicKey, enabled: process.env.PUSH_SITE_REGISTRATION_ENABLED === "true" }, { headers: cors(origin) });
}
export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = allowedOrigin(request);
  if (!origin) return new NextResponse(null, { status: 403 });
  if (process.env.PUSH_SITE_REGISTRATION_ENABLED !== "true") {
    return errorResponse("Cadastro de push editorial ainda não ativado.", 503, origin);
  }
  const client = admin();
  if (!client) return errorResponse("Serviço indisponível.", 503, origin);
  if (Number(request.headers.get("content-length") || 0) > 4096) return errorResponse("Payload grande demais.", 413, origin);
  let body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; news?: unknown; urgent?: unknown };
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid");
  } catch { return errorResponse("Dados inválidos.", 400, origin); }
  const endpoint = endpointValue(body.endpoint);
  const p256dh = body.keys?.p256dh;
  const secret = body.keys?.auth;
  if (!endpoint || !keyValue(p256dh,70,120) || !keyValue(secret,18,50)) {
    return errorResponse("Inscrição inválida.", 400, origin);
  }
  if (typeof body.news !== "boolean" || typeof body.urgent !== "boolean" || (!body.news && !body.urgent)) {
    return errorResponse("Escolha as notificações desejadas.", 400, origin);
  }
  const { data: existing, error: lookupError } = await client.from("notification_push_subscriptions")
    .select("app_kind").eq("endpoint",endpoint).maybeSingle();
  if (lookupError) return errorResponse("Não foi possível validar o dispositivo.", 500, origin);
  if (existing?.app_kind === "sistema") return errorResponse("Este dispositivo pertence ao Sistema.", 409, origin);
  const { error } = await client.from("notification_push_subscriptions").upsert({
    app_kind: "site",profile_id:null,endpoint,p256dh,auth_secret:secret,enabled:true,
    news_opt_in:body.news,urgent_opt_in:body.urgent,agenda_opt_in:false,
    updated_at:new Date().toISOString(),last_error:null,
  },{onConflict:"endpoint"});
  if (error) return errorResponse("Falha ao cadastrar dispositivo.", 500, origin);
  return NextResponse.json({ok:true},{headers:cors(origin)});
}
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const origin = allowedOrigin(request);
  if (!origin) return new NextResponse(null, { status: 403 });
  const client = admin();
  if (!client) return errorResponse("Serviço indisponível.", 503, origin);
  let body:{endpoint?:unknown};
  try {body=await request.json();if(!body||typeof body!=="object")throw Error("bad");}
  catch{return errorResponse("Dados inválidos.",400,origin);}
  const endpoint=endpointValue(body.endpoint);
  if(!endpoint)return errorResponse("Dispositivo inválido.",400,origin);
  const {error}=await client.from("notification_push_subscriptions")
    .update({enabled:false,news_opt_in:false,urgent_opt_in:false,updated_at:new Date().toISOString()})
    .eq("app_kind","site").eq("endpoint",endpoint);
  if(error)return errorResponse("Falha ao desativar notificações.",500,origin);
  return NextResponse.json({ok:true},{headers:cors(origin)});
}
