import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { listReportExcludedReceivableIds, withoutExcludedReceivables } from "../../../../../providers/supabase/receivableReportExclusion.supabase";
import {
  FINANCE_BRIDGE_VERSION, FINANCE_PAGE_SIZE, allowedFinanceClient,
  canonicalIdOrNull, financeBridgeAuthorized, parseFinanceOffset, projectFinanceSaleServices,
  type JornalFinancePreviewResponse,
} from "../../../../../lib/integrations/altnixFinanceReadContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function respond(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * Consulta para conciliação de contratos legados (NUNCA migra dinheiro).
 * A integração cadastral publicada é independente e não é alterada aqui.
 * Ativação exclusivamente manual: segredo >=32, allowlist de clientes
 * canônicos e flag de leitura na Production (três travas independentes).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.VERCEL_ENV !== "production"
    || process.env.JORNALIR_FINANCE_BRIDGE_READ_ENABLED !== "true") {
    return respond({ error: "Conciliação financeira não ativada." }, 503);
  }
  if (!financeBridgeAuthorized(
    request.headers.get("authorization"), process.env.JORNALIR_FINANCE_BRIDGE_SECRET,
  )) return respond({ error: "Não autorizado." }, 401);

  const raw = await request.text();
  if (raw.length > 512) return respond({ error: "Requisição muito extensa." }, 413);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return respond({ error: "Requisição inválida." }, 400);
  }
  const id = canonicalIdOrNull(body.canonicalClientId);
  const offset = parseFinanceOffset(body.offset);
  if (!id || offset === null) return respond({ error: "Identificador ou paginação inválidos." }, 400);
  if (!allowedFinanceClient(id, process.env.JORNALIR_FINANCE_BRIDGE_ALLOWED_CLIENT_IDS)) {
    return respond({ error: "Cadastro não autorizado para conciliação." }, 403);
  }

  try {
    const db = createSupabaseAdminClient();
    const { data: client, error: clientError } = await db.from("clients")
      .select("id,client_digital_export_permissions!inner(enabled)").eq("id", id).eq("status", "active").eq("client_digital_export_permissions.enabled", true).maybeSingle();
    if (clientError) return respond({ error: "Consulta temporariamente indisponível." }, 503);
    if (!client) return respond({ error: "Cadastro não localizado ou inativo." }, 404);

    // Títulos classificados como teste não são enviados ao Informativo (histórico preservado no Jornal).
    const excludedIds = await listReportExcludedReceivableIds(db);
    const { data, error, count } = await withoutExcludedReceivables(db.from("receivables")
      .select(
        "id,status,original_amount,issue_date,due_date,source_type,source_id,source_reference,contract_id,commercial_sale_id,installment_number,competency_date",
        { count: "exact" },
      )
      .eq("client_id", id), "id", excludedIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + FINANCE_PAGE_SIZE - 1);
    if (error || count === null) return respond({ error: "Consulta temporariamente indisponível." }, 503);
    const receivables = (data ?? []).map((row) => ({
      id: row.id as string,
      status: row.status as string,
      originalAmount: Number(row.original_amount),
      issueDate: row.issue_date as string | null,
      dueDate: row.due_date as string | null,
      sourceType: row.source_type as string | null,
      sourceId: row.source_id as string | null,
      sourceReference: row.source_reference as string | null,
      contractId: row.contract_id as string | null,
      commercialSaleId: row.commercial_sale_id as string | null,
      installmentNumber: row.installment_number as number | null,
      competencyDate: row.competency_date as string | null,
    }));
    const ids = receivables.map((row) => row.id);
    let receipts: JornalFinancePreviewResponse["receipts"] = [];
    let receiptsComplete = true;
    if (ids.length) {
      const { data: paid, error: paidError, count: paidCount } = await db.from("receivable_receipts")
        .select("id,receivable_id,amount,received_at,reversed_at", { count: "exact" })
        .in("receivable_id", ids)
        .order("id").limit(500);
      if (paidError) return respond({ error: "Consulta temporariamente indisponível." }, 503);
      receiptsComplete = paidCount !== null && paidCount === (paid ?? []).length;
      receipts = (paid ?? []).map((row) => ({
        id: row.id as string,
        receivableId: row.receivable_id as string,
        amount: Number(row.amount),
        receivedAt: row.received_at as string | null,
        reversed: Boolean(row.reversed_at),
      }));
    }

    // Composição por serviço (aditiva): permite ao portal mostrar o que está sendo pago e tratar títulos
    // substitutos de reestruturação. Falha/ausência não derruba a consulta; o Informativo trata como não disponível.
    let composition: JornalFinancePreviewResponse["composition"];
    if (ids.length) {
      const [allocationResult, restructuredResult] = await Promise.all([
        db.from("receivable_service_allocations")
          .select("receivable_id,service_id,commercial_contract_services(service_title)").in("receivable_id", ids).limit(1000),
        db.from("receivables").select("id").in("id", ids).not("restructuring_id", "is", null),
      ]);
      if (!allocationResult.error && !restructuredResult.error) {
        const restructured = new Set((restructuredResult.data ?? []).map((row) => row.id as string));
        const grouped = new Map<string, Array<{ serviceId: string; title: string }>>();
        for (const row of allocationResult.data ?? []) {
          const service = row.commercial_contract_services as unknown as { service_title?: string } | { service_title?: string }[] | null;
          const title = String((Array.isArray(service) ? service[0] : service)?.service_title ?? "Serviço").slice(0, 160);
          const list = grouped.get(row.receivable_id as string) ?? [];
          list.push({ serviceId: row.service_id as string, title });
          grouped.set(row.receivable_id as string, list);
        }
        composition = [...grouped.entries()].map(([receivableId, services]) => ({ receivableId, restructured: restructured.has(receivableId), services }));
      }
    }

    // Consultar vendas existentes, inclusive as que ainda não geraram títulos.
    // Sem inferir serviço pelo canal textual nem autorizar migração.
    const { data: saleRows, error: saleError, count: saleCount } = await db.from("commercial_sales")
      .select("id,internal_reference,channel,product_id,commercial_condition,status,start_date,end_date,installments_count,items_snapshot", { count: "exact" })
      .eq("client_id", id)
      .order("id").limit(FINANCE_PAGE_SIZE);
    if (saleError || saleCount === null) return respond({ error: "Consulta temporariamente indisponível." }, 503);
    const sales: JornalFinancePreviewResponse["sales"] = (saleRows ?? []).map((row) => ({
      id: row.id as string,
      reference: row.internal_reference as string,
      channel: row.channel as string,
      productId: row.product_id as string | null,
      condition: row.commercial_condition as string,
      status: row.status as string,
      startDate: row.start_date as string,
      endDate: row.end_date as string | null,
      installmentsCount: Number(row.installments_count),
      services: projectFinanceSaleServices(row.items_snapshot),
    }));

    // Reutiliza os UUIDs das contratações existentes, não cria contrato paralelo.
    // Limites explícitos: uma resposta parcial jamais comprova autorização.
    let contracts: JornalFinancePreviewResponse["contracts"] = [];
    let contractsComplete = saleCount === sales.length;
    if (sales.length) {
      const {data: packages,error: packageError,count: packageCount}=await db.from("commercial_contract_packages")
        .select("id,commercial_sale_id,document_mode,status",{count:"exact"})
        .eq("client_id",id).in("commercial_sale_id",sales.map(s=>s.id)).order("id").limit(FINANCE_PAGE_SIZE);
      if(packageError||packageCount===null) return respond({error:"Consulta temporariamente indisponível."},503);
      contractsComplete=contractsComplete && packageCount===(packages??[]).length;
      const packageIds=(packages??[]).map(p=>p.id);
      if(packageIds.length){
        const {data: serviceRows,error: serviceError,count: serviceCount}=await db.from("commercial_contract_services")
          .select("id,package_id,item_ordinal,service_channel,starts_on,ends_on",{count:"exact"})
          .in("package_id",packageIds).order("id").limit(500);
        if(serviceError||serviceCount===null) return respond({error:"Consulta temporariamente indisponível."},503);
        contractsComplete=contractsComplete && serviceCount===(serviceRows??[]).length;
        contracts=(packages??[]).map(p=>({
          id:p.id,saleId:p.commercial_sale_id,documentMode:p.document_mode,status:p.status,
          services:(serviceRows??[]).filter(service=>service.package_id===p.id).map(service=>({
            id:service.id,serviceChannel:service.service_channel,itemOrdinal:service.item_ordinal,
            startsOn:service.starts_on,endsOn:service.ends_on,
          })).sort((a,b)=>a.itemOrdinal-b.itemOrdinal),
        }));
        if(contracts.some(c=>!c.services.length))contractsComplete=false;
      }
    }
    const response: JornalFinancePreviewResponse = {
      version: FINANCE_BRIDGE_VERSION,
      source: "jornal_ir",
      mode: "readonly",
      financeCutoverActive: false,
      canonicalClientId: id,
      total: count,
      offset,
      hasMore: offset + receivables.length < count,
      receivables,
      receipts,
      receiptsComplete,
      sales,
      salesTotal: saleCount,
      salesComplete: saleCount === sales.length,
      contracts, contractsComplete,
      ...(composition ? { composition } : {}),
    };
    return respond(response);
  } catch {
    return respond({ error: "Conciliação temporariamente indisponível." }, 503);
  }
}
