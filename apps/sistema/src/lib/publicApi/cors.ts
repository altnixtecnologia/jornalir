import "server-only";
import { NextRequest, NextResponse } from "next/server";

/**
 * CORS compartilhado pelas rotas /api/public/* chamadas pelo site público
 * (apps/site, outra origem). Mesma allow-list usada pelo push original —
 * extraído para reaproveitar entre /api/public/push e /api/public/notifications
 * (18/10/2026) em vez de duplicar a lógica de segurança.
 */
export function allowedOrigins(): Set<string> {
  const configured = (process.env.PUSH_ALLOWED_SITE_ORIGINS || "").split(/[,;\s]+/).filter(Boolean);
  return new Set(
    ["https://jornalir.vercel.app", ...configured]
      .map((value) => {
        try {
          return new URL(value).origin;
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );
}

export function corsOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  return origin && allowedOrigins().has(origin) ? origin : null;
}

export function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    // X-Notification-Token: identidade anônima do leitor via cabeçalho, não
    // via query string, para GET de /api/public/notifications (18/10/2026).
    "Access-Control-Allow-Headers": "Content-Type, X-Notification-Token",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
}

export function corsJson(data: unknown, status: number, origin: string): NextResponse {
  return NextResponse.json(data, { status, headers: corsHeaders(origin) });
}
