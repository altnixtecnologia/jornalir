import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runEditionMateriasWorkUnit } from "../../../../lib/editorial/editionMateriasWorker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Worker durável da separação automática de matérias (correção da
 * auditoria, item 3, 06/11/2026). Acionado por pg_cron via pg_net
 * (`public.invoke_edition_materias_cron()`, migration
 * 20261121100000_newspaper_edition_unified_online_flow.sql), o mesmo
 * padrão já usado por `/api/cron/agenda-telegram` — pg_cron por si só só
 * executa SQL, não roda PDF.js/Node, então precisa de um disparo HTTP
 * autenticado para alcançar este worker.
 *
 * DEPENDÊNCIA DE AMBIENTE: exige um segredo `edition_materias_cron_secret`
 * no Vault remoto do Supabase com o MESMO valor da variável de ambiente
 * `CRON_SECRET` desta aplicação — sem isso, `invoke_edition_materias_cron()`
 * lança excecão no Postgres e este worker nunca é chamado automaticamente
 * (o upload ainda enfileira a edição; só a retomada automática fica
 * pendente até o segredo ser cadastrado).
 *
 * `claim_newspaper_editions_for_materias_work` reivindica atomicamente
 * (for update skip locked) até 3 edições por execução — fila (materias_
 * status='queued') ou trabalho preso em 'processing' há mais de 10
 * minutos (lease expirado, retomada automática sem intervenção manual).
 * Cada edição processa só um lote limitado de candidatos por chamada
 * (`runEditionMateriasWorkUnit`/CHUNK_SIZE) — nunca uma edição inteira de
 * uma vez, para nunca se aproximar do timeout da função serverless.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== "Bearer " + secret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }

  const db = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });

  const { data: claimed, error: claimError } = await db.rpc("claim_newspaper_editions_for_materias_work", {
    p_limit: 3,
    p_lease_minutes: 10,
  });
  if (claimError) {
    return NextResponse.json({ error: "Falha ao reivindicar edições: " + claimError.message }, { status: 500 });
  }

  const results: Array<{ editionId: string; status: string; candidateCount: number; draftCount: number; pendingRemaining: number }> = [];
  for (const row of (claimed ?? []) as Array<{ edition_id: string }>) {
    try {
      const outcome = await runEditionMateriasWorkUnit(db, row.edition_id, { respectAutomaticRetryLimit: true });
      results.push({ editionId: row.edition_id, ...outcome });
    } catch (error) {
      results.push({
        editionId: row.edition_id,
        status: "failed",
        candidateCount: 0,
        draftCount: 0,
        pendingRemaining: 0,
      });
      await db.from("audit_events").insert({
        user_id: null,
        entity_type: "newspaper_editions",
        entity_id: row.edition_id,
        action: "edition_materias_worker_failed",
        metadata: { error: error instanceof Error ? error.message : "Falha desconhecida no worker.", origin: "cron:edition-materias" },
      });
    }
  }

  return NextResponse.json({ processed: results.length, results }, { headers: { "Cache-Control": "no-store" } });
}
