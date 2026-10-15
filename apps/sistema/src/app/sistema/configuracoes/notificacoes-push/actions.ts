"use server";
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export type PushActionResult = { ok?: true; error?: string };

export async function enqueueSitePushAction(form: FormData): Promise<PushActionResult> {
  try {
    const auth = createSupabaseServerClient();
    const { data: { user }, error: authError } = await auth.auth.getUser();
    if (authError || !user) return { error: "Sessão expirada. Entre novamente." };
    const { data: profile, error: profileError } = await auth.from("profiles")
      .select("role,active").eq("id", user.id).maybeSingle();
    if (profileError || !profile?.active || !["owner", "admin"].includes(profile.role)) {
      return { error: "Apenas administradores podem enviar notificações." };
    }
    const kind = String(form.get("kind") || "");
    const title = String(form.get("title") || "").trim();
    const body = String(form.get("body") || "").trim();
    const href = String(form.get("href") || "").trim();
    const requestId = String(form.get("request_id") || "").trim();
    if (kind !== "ordinary" && kind !== "urgent") return { error: "Tipo inválido." };
    if (!title || title.length > 110) return { error: "Título obrigatório, até 110 caracteres." };
    if (!body || body.length > 320) return { error: "Texto obrigatório, até 320 caracteres." };
    if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\") || /[\r\n]/.test(href) || href.length > 500) {
      return { error: "Informe um link interno do jornal, começando com /." };
    }
    if (!/^[a-f0-9-]{36}$/i.test(requestId)) return { error: "Identificador do envio inválido." };
    const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!dbUrl || !key) return { error: "Notificações não configuradas no servidor." };
    const db = createClient(dbUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await db.from("notification_events").upsert({
      app_kind: "site", kind, title, body, href,
      scheduled_at: new Date().toISOString(),
      dedupe_key: "site-editorial:" + requestId,
    }, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (result.error) return { error: "Falha ao preparar o envio: " + result.error.message };
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao preparar notificação." };
  }
}
