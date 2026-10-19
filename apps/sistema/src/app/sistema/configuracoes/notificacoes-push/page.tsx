import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { EditorialPushSender, type EditorialPushPrefill } from "./EditorialPushSender";

export const dynamic = "force-dynamic";

export default async function PushEditorialPage({
  searchParams,
}: {
  searchParams?: { article_id?: string; kind?: string };
}): Promise<JSX.Element> {
  const client = createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await client.from("profiles").select("role,active").eq("id", user.id).maybeSingle();
  if (!profile?.active || !["owner","admin"].includes(profile.role)) redirect("/sistema");

  // Dados do vínculo vêm do banco autenticado, não de texto de URL.
  // A ação de enfileirar repete a autorização e exige confirmação humana.
  let prefill: EditorialPushPrefill | undefined;
  const articleId = searchParams?.article_id;
  if (articleId && /^[a-f0-9-]{36}$/i.test(articleId)) {
    const { data: article } = await client.from("articles")
      .select("title,subtitle,slug,status").eq("id", articleId).maybeSingle();
    if (article?.status === "published" && article.slug) {
      prefill = {
        title: article.title.slice(0, 110),
        body: (article.subtitle || article.title).slice(0, 320),
        href: "/noticias/" + article.slug,
        kind: searchParams?.kind === "urgent" ? "urgent" : "ordinary",
      };
    }
  }

  const enabled = process.env.EDITORIAL_PUSH_MANUAL_ENABLED === "true";
  const nativeDeliveryEnabled = process.env.NATIVE_FCM_DELIVERY_ENABLED === "true";
  const eligibleByKind = { ordinary: 0, urgent: 0 };
  const counts = { web: 0, native: 0, fcmAccepted: 0, fcmFailed: 0, fcmPending: 0 };
  let nativeSchemaReady = false;

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [web, native, deliveries] = await Promise.all([
      db.from("site_push_subscriptions").select("ordinary_enabled,urgent_enabled").eq("enabled", true).limit(3000),
      db.from("native_push_devices").select("ordinary_enabled,urgent_enabled").eq("enabled", true).limit(3000),
      db.from("native_push_deliveries").select("status")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).limit(3000),
    ]);
    if (!web.error) {
      counts.web = (web.data ?? []).length;
      eligibleByKind.ordinary += (web.data ?? []).filter((row) => row.ordinary_enabled).length;
      eligibleByKind.urgent += (web.data ?? []).filter((row) => row.urgent_enabled).length;
    }
    if (!native.error) {
      nativeSchemaReady = true;
      counts.native = (native.data ?? []).length;
      if (nativeDeliveryEnabled) {
        eligibleByKind.ordinary += (native.data ?? []).filter((row) => row.ordinary_enabled).length;
        eligibleByKind.urgent += (native.data ?? []).filter((row) => row.urgent_enabled).length;
      }
    }
    if (!deliveries.error) {
      counts.fcmAccepted = (deliveries.data ?? []).filter((row) => row.status === "sent").length;
      counts.fcmFailed = (deliveries.data ?? []).filter((row) => ["failed", "uncertain", "expired"].includes(row.status)).length;
      counts.fcmPending = (deliveries.data ?? []).filter((row) => ["pending", "sending"].includes(row.status)).length;
    }
  }

  return (
    <>
      <ModuleHeader eyebrow="CONFIGURAÇÕES" title="Notificações do Jornal IR" description="Prepare um aviso comum ou urgente para quem aceitou receber notificações." />
      <section className="form-section" aria-label="Situação da entrega das notificações">
        <h2>Entrega das notificações</h2>
        <p className="helper-text">
          Web Push: {counts.web} inscrições ativas. Android FCM: {counts.native} aparelhos inscritos.
          {!nativeSchemaReady ? " Banco nativo ainda não preparado." : ""}
        </p>
        <p className="helper-text">
          Android, últimas 24 horas: {counts.fcmPending} pendentes,
          {" "}{counts.fcmAccepted} aceitas pelo Firebase e {counts.fcmFailed} falhas/incertas.
          Aceita pelo Firebase não significa necessariamente exibida ou lida no celular.
        </p>
        <p className="helper-text">
          Disparo editorial: {enabled ? "habilitado" : "DESATIVADO"}.
          Entrega nativa: {nativeDeliveryEnabled ? "habilitada" : "DESATIVADA"}.
        </p>
      </section>
      <EditorialPushSender prefill={prefill} enabled={enabled} eligibleByKind={eligibleByKind} />
    </>
  );
}
