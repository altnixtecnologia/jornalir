import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { allowedPushSiteOrigin, validSubscription, vapidPublicKey } from "../../../lib/notifications/webPush";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function corsHeaders(origin: string, request: NextRequest): HeadersInit {
  const sameOrigin = origin === request.nextUrl.origin;
  return sameOrigin || allowedPushSiteOrigin(origin)
    ? { "Access-Control-Allow-Origin": origin, Vary: "Origin",
        "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store" }
    : { "Cache-Control": "no-store" };
}

function approvedOrigin(request: NextRequest): { origin: string; allowed: boolean } {
  const origin = request.headers.get("origin") || "";
  return { origin, allowed: Boolean(origin) &&
    (origin === request.nextUrl.origin || allowedPushSiteOrigin(origin)) };
}

function respond(request: NextRequest, body: unknown, status: number): NextResponse {
  const { origin } = approvedOrigin(request);
  return NextResponse.json(body, { status, headers: corsHeaders(origin, request) });
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const { origin, allowed } = approvedOrigin(request);
  return new NextResponse(null, { status: allowed ? 204 : 403,
    headers: corsHeaders(origin, request) });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // VAPID's public key is not a secret; safe to expose.
  return respond(request, { publicKey: vapidPublicKey() }, 200);
}

type Input = {
  appKind?: string;
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  preferences?: { news?: boolean; urgent?: boolean; agenda?: boolean };
};

async function parseInput(request: NextRequest): Promise<Input | null> {
  const size = Number(request.headers.get("content-length") || 0);
  if (size > 8192) return null;
  try {
    const text = await request.text();
    if (text.length > 8192) return null;
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value as Input : null;
  } catch {
    return null;
  }
}

async function staffIdentity(): Promise<string | null> {
  const userClient = createSupabaseServerClient();
  const result = await userClient.auth.getUser();
  const userId = result.data.user?.id;
  if (!userId || result.error) return null;
  const profile = await userClient.from("profiles").select("id,active").eq("id", userId).maybeSingle();
  if (profile.error || !profile.data?.active) return null;
  const access = await userClient.rpc("has_staff_module_access", {
    p_module: "agenda", p_write: false,
  });
  return access.error || access.data !== true ? null : userId;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { allowed } = approvedOrigin(request);
  if (!allowed) return respond(request, { error: "Origem não permitida." }, 403);
  if (!vapidPublicKey()) return respond(request, { error: "Notificações ainda não configuradas." }, 503);
  const input = await parseInput(request);
  if (!input || (input.appKind !== "site" && input.appKind !== "sistema")) {
    return respond(request, { error: "Aplicativo inválido." }, 400);
  }
  const keys = {
    endpoint: input.endpoint ?? "",
    p256dh: input.keys?.p256dh ?? "",
    auth_secret: input.keys?.auth ?? "",
  };
  if (!validSubscription(keys)) return respond(request, { error: "Assinatura push inválida." }, 400);
  let profileId: string | null = null;
  if (input.appKind === "sistema") {
    if (request.headers.get("origin") !== request.nextUrl.origin) {
      return respond(request, { error: "Aplicativo administrativo exige a mesma origem." }, 403);
    }
    profileId = await staffIdentity();
    if (!profileId) return respond(request, { error: "Sessão inválida." }, 401);
  }
  const admin = createSupabaseAdminClient();
  const old = await admin.from("notification_push_subscriptions")
    .select("id,app_kind,profile_id").eq("endpoint", keys.endpoint).maybeSingle();
  if (old.error) return respond(request, { error: "Falha ao conferir aparelho." }, 500);
  if (old.data && (old.data.app_kind !== input.appKind || old.data.profile_id !== profileId)) {
    return respond(request, { error: "Esta assinatura pertence a outra sessão." }, 409);
  }

  const next = {
    app_kind: input.appKind,
    profile_id: profileId,
    endpoint: keys.endpoint,
    p256dh: keys.p256dh,
    auth_secret: keys.auth_secret,
    enabled: true,
    news_opt_in: input.appKind === "site" && input.preferences?.news === true,
    urgent_opt_in: input.appKind === "site" && input.preferences?.urgent === true,
    agenda_opt_in: input.appKind === "sistema" && input.preferences?.agenda === true,
    updated_at: new Date().toISOString(),
  };
  if (!next.news_opt_in && !next.urgent_opt_in && !next.agenda_opt_in) {
    return respond(request, { error: "Selecione pelo menos um tipo de notificação." }, 400);
  }
  const saved = await admin.from("notification_push_subscriptions").upsert(next, { onConflict: "endpoint" });
  if (saved.error) return respond(request, { error: "Não foi possível cadastrar este aparelho." }, 500);
  return respond(request, { ok: true }, 200);
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const { allowed } = approvedOrigin(request);
  if (!allowed) return respond(request, { error: "Origem não permitida." }, 403);
  const input = await parseInput(request);
  if (!input || (input.appKind !== "site" && input.appKind !== "sistema")) {
    return respond(request, { error: "Aplicativo inválido." }, 400);
  }
  const endpoint = input.endpoint ?? "";
  const secret = input.keys?.auth ?? "";
  if (!endpoint || !secret) return respond(request, { error: "Assinatura inválida." }, 400);
  const admin = createSupabaseAdminClient();
  const existing = await admin.from("notification_push_subscriptions")
    .select("id,auth_secret,profile_id,app_kind").eq("endpoint", endpoint).maybeSingle();
  if (existing.error) return respond(request, { error: "Falha ao localizar aparelho." }, 500);
  if (!existing.data) return respond(request, { ok: true }, 200);
  if (existing.data.app_kind !== input.appKind || existing.data.auth_secret !== secret) {
    return respond(request, { error: "Assinatura não corresponde." }, 403);
  }
  if (input.appKind === "sistema" &&
      (request.headers.get("origin") !== request.nextUrl.origin ||
       existing.data.profile_id !== await staffIdentity())) {
    return respond(request, { error: "Sessão inválida." }, 401);
  }
  const deleted = await admin.from("notification_push_subscriptions")
    .delete().eq("id", existing.data.id);
  if (deleted.error) return respond(request, { error: "Não foi possível desativar." }, 500);
  return respond(request, { ok: true }, 200);
}
