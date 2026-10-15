import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WebSubscription = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  news?: unknown;
  urgent?: unknown;
  agenda?: unknown;
};
function forbidden(): NextResponse {
  return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
}
function checkOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(request.url).origin;
}
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function authenticatedProfile() {
  const session = createSupabaseServerClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await session.from("profiles").select("id,active").eq("id", user.id).maybeSingle();
  if (!profile?.active) return null;
  return user.id;
}
function validateEndpoint(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
function validateKey(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!checkOrigin(request)) return forbidden();
  const userId = await authenticatedProfile();
  if (!userId) return forbidden();
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "Serviço de notificações não configurado." }, { status: 503 });
  let payload: WebSubscription;
  try {
    if (Number(request.headers.get("content-length") || 0) > 8192) return NextResponse.json({ error: "Payload grande demais." }, { status: 413 });
    payload = await request.json() as WebSubscription;
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const endpoint = validateEndpoint(payload.endpoint);
  const publicKey = payload.keys?.p256dh;
  const authKey = payload.keys?.auth;
  if (!endpoint || !validateKey(publicKey, 70, 120) || !validateKey(authKey, 18, 50)) {
    return NextResponse.json({ error: "Inscrição Web Push inválida." }, { status: 400 });
  }
  if ([payload.news, payload.urgent, payload.agenda].some(v => v !== undefined && typeof v !== "boolean")) {
    return NextResponse.json({ error: "Preferências inválidas." }, { status: 400 });
  }
  // Um navegador pode trocar de usuário: substituir o vínculo evita entregar
  // compromissos da conta anterior ao próximo usuário no mesmo dispositivo.
  const { error } = await admin.from("notification_push_subscriptions").upsert({
    app_kind: "sistema",
    profile_id: userId,
    endpoint,
    p256dh: publicKey,
    auth_secret: authKey,
    enabled: true,
    news_opt_in: false,
    urgent_opt_in: false,
    agenda_opt_in: payload.agenda === true,
    updated_at: new Date().toISOString(),
    last_error: null,
  }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: "Não foi possível cadastrar o dispositivo." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  if (!checkOrigin(request)) return forbidden();
  const userId = await authenticatedProfile();
  if (!userId) return forbidden();
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "Serviço de notificações não configurado." }, { status: 503 });
  let payload: { endpoint?: unknown };
  try {
    payload = await request.json() as { endpoint?: unknown };
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const endpoint = validateEndpoint(payload.endpoint);
  if (!endpoint) return NextResponse.json({ error: "Dispositivo inválido." }, { status: 400 });
  const { error } = await admin.from("notification_push_subscriptions")
    .update({ enabled: false, agenda_opt_in: false, updated_at: new Date().toISOString() })
    .eq("endpoint", endpoint)
    .eq("profile_id", userId)
    .eq("app_kind", "sistema");
  if (error) return NextResponse.json({ error: "Não foi possível desligar notificações." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
