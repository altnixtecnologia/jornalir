"use server";
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export async function sendMyPushTestAction(requestId: string): Promise<{ ok?: true; error?: string }> {
  if (!/^[a-f0-9-]{36}$/i.test(requestId)) return { error: "Identificador inválido." };
  const browserSession = createSupabaseServerClient();
  const { data: { user }, error: authError } = await browserSession.auth.getUser();
  if (authError || !user) return { error: "Sessão expirada." };
  const { data: profile, error: profileError } = await browserSession.from("profiles")
    .select("active").eq("id", user.id).maybeSingle();
  if (profileError || !profile?.active) return { error: "Perfil inativo." };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return { error: "Push não configurado." };
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const recent = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: previous, error: readError } = await db.from("notification_events").select("id")
    .eq("app_kind", "sistema").eq("target_profile_id", user.id)
    .gte("scheduled_at", recent).like("dedupe_key", "push-test:" + user.id + ":%").limit(1);
  if (readError) return { error: "Não foi possível conferir o limite de testes." };
  if ((previous?.length ?? 0) > 0) return { error: "Aguarde dois minutos antes de repetir." };
  const result = await db.from("notification_events").upsert({
    app_kind: "sistema", kind: "ordinary", target_profile_id: user.id,
    title: "Jornal IR | Teste de notificação",
    body: "Este é um teste do seu dispositivo. A Agenda permanece independente do Telegram.",
    href: "/sistema/notificacoes", scheduled_at: new Date().toISOString(),
    dedupe_key: "push-test:" + user.id + ":" + requestId,
  }, { onConflict: "dedupe_key", ignoreDuplicates: true });
  if (result.error) return { error: "Falha ao agendar teste." };
  return { ok: true };
}
