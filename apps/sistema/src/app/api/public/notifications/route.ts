import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { corsOrigin, corsHeaders, corsJson as json } from "../../../../lib/publicApi/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Central de notificações do leitor (sininho do site/app) — 18/10/2026.
// Reaproveita a mesma tabela notification_events (app_kind='site') já usada
// pelo envio de push real; não existe um segundo sistema de disparo aqui.
// Identidade do leitor = mesmo management token anônimo já usado em
// /api/public/push (localStorage, sem login) — mesmo hash
// sha256("site-push:" + token), para que os dois endpoints reconheçam o
// mesmo dispositivo.

const TOKEN_RE = /^[a-zA-Z0-9_-]{32,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FEED_LIMIT = 40;

type SiteKind = "ordinary" | "urgent" | "administrative";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Servidor não configurado");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

function managementHash(token: string): string {
  return createHash("sha256").update("site-push:" + token).digest("hex");
}

/** Linha não existe ainda = migration 20261030100500 pendente de aplicação. */
function isMissingRelation(error: { code?: string } | null): boolean {
  return error?.code === "42P01";
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const origin = corsOrigin(request);
  if (!origin) return NextResponse.json({ error: "Origem não permitida" }, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = corsOrigin(request);
  if (!origin) return NextResponse.json({ error: "Origem não permitida" }, { status: 403 });

  const tokenParam = request.nextUrl.searchParams.get("managementToken") || "";
  if (tokenParam && !TOKEN_RE.test(tokenParam)) return json({ error: "Identificador inválido" }, 400, origin);

  try {
    const db = service();

    // Preferências do leitor (se já existir cadastro de push para este
    // hash); sem cadastro, usa os mesmos padrões do formulário de
    // preferências: notícias do dia e urgentes sim, avisos gerais não.
    let allowed: Record<SiteKind, boolean> = { ordinary: true, urgent: true, administrative: false };
    if (tokenParam) {
      const hash = managementHash(tokenParam);
      const { data: subscription } = await db
        .from("site_push_subscriptions")
        .select("ordinary_enabled,urgent_enabled,administrative_enabled")
        .eq("management_hash", hash)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (subscription) {
        allowed = {
          ordinary: Boolean(subscription.ordinary_enabled),
          urgent: Boolean(subscription.urgent_enabled),
          administrative: Boolean(subscription.administrative_enabled),
        };
      }
    }

    const { data: events, error: eventsError } = await db
      .from("notification_events")
      .select("id,kind,title,body,href,scheduled_at")
      .eq("app_kind", "site")
      .order("scheduled_at", { ascending: false })
      .limit(FEED_LIMIT);
    if (eventsError) return json({ error: "Não foi possível carregar avisos" }, 500, origin);

    const visible = (events ?? []).filter((event) => allowed[event.kind as SiteKind] !== false);

    let readIds = new Set<string>();
    if (tokenParam && visible.length > 0) {
      const hash = managementHash(tokenParam);
      const { data: reads, error: readsError } = await db
        .from("site_notification_reads")
        .select("event_id")
        .eq("management_hash", hash)
        .in("event_id", visible.map((event) => event.id));
      // Migration ainda não aplicada: trata tudo como não lido (degrada
      // sem quebrar a central), em vez de falhar a requisição inteira.
      if (!readsError) readIds = new Set((reads ?? []).map((row) => row.event_id as string));
      else if (!isMissingRelation(readsError)) return json({ error: "Não foi possível carregar o estado de leitura" }, 500, origin);
    }

    const items = visible.map((event) => ({
      id: event.id as string,
      kind: event.kind as SiteKind,
      title: event.title as string,
      body: event.body as string,
      href: (event.href as string | null) ?? null,
      scheduledAt: event.scheduled_at as string,
      read: readIds.has(event.id as string),
    }));

    return json({ ok: true, items, unreadCount: items.filter((item) => !item.read).length }, 200, origin);
  } catch {
    return json({ error: "Serviço de notificações indisponível" }, 500, origin);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = corsOrigin(request);
  if (!origin) return NextResponse.json({ error: "Origem não permitida" }, { status: 403 });

  try {
    const raw = await request.text();
    if (raw.length > 2000) return json({ error: "Corpo inválido" }, 400, origin);
    const body = JSON.parse(raw) as { managementToken?: unknown; eventId?: unknown };
    if (typeof body.managementToken !== "string" || !TOKEN_RE.test(body.managementToken)) {
      return json({ error: "Identificador inválido" }, 400, origin);
    }
    if (typeof body.eventId !== "string" || !UUID_RE.test(body.eventId)) {
      return json({ error: "Aviso inválido" }, 400, origin);
    }

    const db = service();
    const hash = managementHash(body.managementToken);
    const { error } = await db
      .from("site_notification_reads")
      .upsert({ management_hash: hash, event_id: body.eventId, read_at: new Date().toISOString() }, { onConflict: "management_hash,event_id" });

    if (error) {
      if (isMissingRelation(error)) return json({ error: "Recurso ainda não disponível (migration pendente)" }, 503, origin);
      return json({ error: "Não foi possível marcar como lido" }, 400, origin);
    }
    return json({ ok: true }, 200, origin);
  } catch {
    return json({ error: "Não foi possível marcar como lido" }, 400, origin);
  }
}
