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
  let eligibleCount = 0;
  if (enabled && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const column = prefill?.kind === "urgent" ? "urgent_enabled" : "ordinary_enabled";
    const { count, error } = await db.from("site_push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("enabled", true).eq(column, true);
    if (!error) eligibleCount = count ?? 0;
  }
  return (
    <>
      <ModuleHeader eyebrow="CONFIGURAÇÕES" title="Notificações do Jornal IR" description="Prepare um aviso comum ou urgente para quem aceitou receber notificações." />
      <EditorialPushSender prefill={prefill} enabled={enabled} eligibleCount={eligibleCount} />
    </>
  );
}
