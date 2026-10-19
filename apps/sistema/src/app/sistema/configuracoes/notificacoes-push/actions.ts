"use server";
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export type PushActionResult = { ok?: true; error?: string; needsDuplicateConfirm?: true };

/** Mesmo padrão de URL usado por /noticias/[slug] e pelo gatilho
 * article-publish:<id> — para saber se o link manual aponta para uma
 * matéria que já pode ter sido notificada automaticamente. */
const ARTICLE_HREF_RE = /^\/noticias\/([a-z0-9-]+)\/?$/i;

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
    const confirmDuplicate = form.get("confirm_duplicate") === "1";
    if (kind !== "ordinary" && kind !== "urgent") return { error: "Tipo inválido." };
    if (!title || title.length > 110) return { error: "Título obrigatório, até 110 caracteres." };
    if (!body || body.length > 320) return { error: "Texto obrigatório, até 320 caracteres." };
    // O mesmo link precisa funcionar no portal e no app Android FCM.
    // O worker nativo só permite abrir matérias, não URLs arbitrárias.
    if (!ARTICLE_HREF_RE.test(href) || href.length > 500) {
      return { error: "Informe o link de uma matéria no formato /noticias/nome-da-materia." };
    }
    if (!/^[a-f0-9-]{36}$/i.test(requestId)) return { error: "Identificador do envio inválido." };
    const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!dbUrl || !key) return { error: "Notificações não configuradas no servidor." };
    const db = createClient(dbUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });

    // Desativado por padrão em produção até a inscrição e homologação de
    // aparelhos. Nunca tratar a seleção no editor como autorização de envio.
    if (process.env.EDITORIAL_PUSH_MANUAL_ENABLED !== "true") {
      return { error: "Envio de notificações em preparação. Nenhum aviso foi enviado ou incluído na fila." };
    }
    const preferenceColumn = kind === "urgent" ? "urgent_enabled" : "ordinary_enabled";
    const { count: webEligible, error: webError } = await db.from("site_push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("enabled", true)
      .eq(preferenceColumn, true);
    if (webError) return { error: "Não foi possível conferir os inscritos Web Push. Nenhum aviso foi enfileirado." };

    // Tokens FCM não são assinaturas VAPID: contam separadamente e apenas
    // quando a entrega nativa estiver autorizada e configurada.
    let nativeEligible = 0;
    if (process.env.NATIVE_FCM_DELIVERY_ENABLED === "true") {
      const native = await db.from("native_push_devices")
        .select("id", { count: "exact", head: true })
        .eq("enabled", true).eq(preferenceColumn, true);
      if (native.error) return { error: "Não foi possível conferir aparelhos Android. Nenhum aviso foi enfileirado." };
      nativeEligible = native.count ?? 0;
    }
    if ((webEligible ?? 0) + nativeEligible === 0) {
      return { error: "Nenhum leitor inscrito e autorizado para avisos deste tipo (Web/Android). Nenhum aviso foi enfileirado." };
    }

    // Evita dois avisos acidentais para a mesma matéria quando o gatilho
    // automático de publicação (article_publish_events_enabled) e este
    // envio manual são usados para o mesmo link — sem impedir um reenvio
    // intencional, desde que o administrador confirme explicitamente.
    const articleMatch = href.match(ARTICLE_HREF_RE);
    if (articleMatch && !confirmDuplicate) {
      const { data: article } = await db.from("articles").select("id").eq("slug", articleMatch[1]).maybeSingle();
      if (article) {
        const { data: existing } = await db
          .from("notification_events")
          .select("id")
          .eq("dedupe_key", "article-publish:" + article.id)
          .maybeSingle();
        if (existing) return { error: "Esta matéria já gerou um aviso automático ao ser publicada.", needsDuplicateConfirm: true };
      }
    }

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


/** Homologação pontual: envia só ao dispositivo selecionado por owner/admin.
 * Não cria evento editorial, não ativa fila e não dispara para leitores.
 * NATIVE_FCM_TEST_SEND_ENABLED é independente dos flags de produção.
 */
export async function sendTestNativePushAction(form: FormData): Promise<PushActionResult> {
  try {
    if (process.env.NATIVE_FCM_TEST_SEND_ENABLED !== "true") {
      return { error: "Teste individual FCM desativado no servidor." };
    }
    const auth = createSupabaseServerClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return { error: "Faça login como administrador." };
    const { data: profile } = await auth.from("profiles").select("active,role").eq("id", user.id).maybeSingle();
    if (!profile?.active || !["owner", "admin"].includes(profile.role)) {
      return { error: "Apenas administradores podem testar notificações." };
    }
    const deviceId = String(form.get("deviceId") || "");
    const kind = String(form.get("kind") || "");
    if (!/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(deviceId) || !["ordinary", "urgent"].includes(kind)) {
      return { error: "Aparelho ou tipo de notificação inválido." };
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return { error: "Servidor não configurado." };
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: device, error: deviceError } = await db.from("native_push_devices")
      .select("id,fcm_token,enabled,ordinary_enabled,urgent_enabled,last_seen_at")
      .eq("id", deviceId).maybeSingle();
    if (deviceError || !device || !device.enabled) {
      return { error: "Aparelho não encontrado ou não inscrito." };
    }
    if (!(kind === "urgent" ? device.urgent_enabled : device.ordinary_enabled)) {
      return { error: "O aparelho não autorizou esse tipo de notificação." };
    }
    if (Date.now() - new Date(device.last_seen_at).getTime() > 24 * 60 * 60 * 1000) {
      return { error: "Aparelho não foi atualizado nas últimas 24 horas. Reative os avisos no app." };
    }
    // RPC transacional reutilizado somente como limite de testes por aparelho:
    // máximo 12 requisições por 15 minutos, sem expor token FCM no painel.
    const { createHash, randomUUID } = await import("node:crypto");
    const hash = createHash("sha256").update("native-test-send:" + deviceId).digest("hex");
    const gate = await db.rpc("claim_native_push_registration", { p_client_hash: hash });
    if (gate.error || gate.data !== true) return { error: "Limite de testes atingido ou indisponível." };

    const { data: article, error: articleError } = await db.from("articles")
      .select("slug").eq("status", "published").not("slug", "is", null)
      .order("published_at", { ascending: false }).limit(1).maybeSingle();
    if (articleError || !article?.slug || !/^[a-z0-9-]+$/i.test(article.slug)) {
      return { error: "Nenhuma notícia publicada disponível para o teste de abertura." };
    }
    const { sendFcmToAndroid } = await import("../../../../lib/notifications/firebaseCloudMessaging.server");
    const urgent = kind === "urgent";
    const result = await sendFcmToAndroid({
      token: device.fcm_token, eventId: randomUUID(),
      kind: urgent ? "urgent" : "ordinary",
      title: urgent ? "TESTE URGENTE — Jornal IR" : "TESTE NORMAL — Jornal IR",
      body: urgent ? "Teste de som e vibração de notícia urgente." : "Teste de notificação comum.",
      href: "/noticias/" + article.slug,
    }, { isolatedTest: true });
    if (!result.ok) return { error: "Firebase recusou o teste (" + (result.errorCode || result.status) + ")." };
    return { ok: true };
  } catch {
    // Nunca retornar tokens/chaves nem stack de autenticação FCM ao cliente.
    return { error: "Falha no teste individual de notificação. Confira o log seguro do servidor." };
  }
}
