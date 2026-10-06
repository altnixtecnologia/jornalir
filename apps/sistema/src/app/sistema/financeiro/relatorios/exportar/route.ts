import { NextRequest, NextResponse } from "next/server";
import type { PaymentMethod, ReceivableSourceType, ReceivableStatus } from "@ir/types";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  RECEIVABLE_SOURCE_TYPE_LABELS,
  RECEIVABLE_SOURCE_TYPES,
  RECEIVABLE_STATUS_LABELS,
  RECEIVABLE_STATUSES,
} from "@ir/types";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { listReceivablesAdminPageSupabase } from "../../../../../providers/supabase/receivableRepository.supabase";
import { getClientService } from "../../../../../composition/clientes";

function csvCell(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return /[",;\n]/.test(value) ? `"${escaped}"` : escaped;
}

function formatAmount(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function clientDoc(client: { kind: "individual" | "company"; cpf?: string; cnpj?: string } | undefined): string {
  if (!client) return "";
  return client.kind === "company" ? client.cnpj ?? "" : client.cpf ?? "";
}

/**
 * Exportação real em CSV (Parte 3B, item 11) — respeita o mesmo filtro
 * ativo da tela de Relatórios (mesmos nomes de query params). UTF-8 com
 * BOM pra abrir corretamente acentuado no Excel. Como o banco está
 * offline nesta fase, a função em si já é a implementação definitiva —
 * só não pode ser executada/validada contra dados reais agora.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const supabase = createSupabaseServerClient();

  const status = params.get("status") ?? "";
  const sourceType = params.get("sourceType") ?? "";
  const paymentMethod = params.get("paymentMethod") ?? "";

  const [result, clients] = await Promise.all([
    listReceivablesAdminPageSupabase(supabase, {
      page: 1,
      pageSize: 1000,
      search: params.get("q") ?? "",
      status: RECEIVABLE_STATUSES.includes(status as ReceivableStatus) ? (status as ReceivableStatus) : undefined,
      sourceType: RECEIVABLE_SOURCE_TYPES.includes(sourceType as ReceivableSourceType) ? (sourceType as ReceivableSourceType) : undefined,
      dueFrom: params.get("dueFrom") || undefined,
      dueTo: params.get("dueTo") || undefined,
      competencyFrom: params.get("competencyFrom") || undefined,
      competencyTo: params.get("competencyTo") || undefined,
      contractId: params.get("contractId") || undefined,
      receivedByProfileId: params.get("receivedBy") || undefined,
      recordedByProfileId: params.get("recordedBy") || undefined,
      paymentMethod: PAYMENT_METHODS.includes(paymentMethod as PaymentMethod) ? (paymentMethod as PaymentMethod) : undefined,
      settledWithDifferenceOnly: params.get("settledWithDifferenceOnly") === "1" || undefined,
      withBalanceOnly: params.get("withBalanceOnly") === "1" || undefined,
      partiallyPaidOnly: params.get("partiallyPaidOnly") === "1" || undefined,
    }),
    getClientService(supabase).list(),
  ]);

  const clientById = new Map(clients.map((client) => [client.id, client]));

  const header = [
    "Cliente",
    "CPF/CNPJ",
    "Descrição",
    "Origem",
    "Contrato/referência",
    "Competência",
    "Emissão",
    "Vencimento",
    "Valor original",
    "Recebido",
    "Abatimentos",
    "Saldo",
    "Situação",
  ];

  const rows = result.receivables.map((item) => [
    item.clientName,
    clientDoc(clientById.get(item.clientId)),
    item.description,
    RECEIVABLE_SOURCE_TYPE_LABELS[item.sourceType],
    item.sourceReference ?? "",
    formatDate(item.competencyDate),
    formatDate(item.issueDate),
    formatDate(item.dueDate),
    formatAmount(item.originalAmount),
    formatAmount(item.totalReceived),
    formatAmount(item.totalAdjustments),
    formatAmount(item.balance),
    RECEIVABLE_STATUS_LABELS[item.status],
  ]);

  const lines = [header, ...rows].map((row) => row.map((cell) => csvCell(String(cell))).join(";"));
  const csv = "﻿" + lines.join("\r\n") + "\r\n";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorio-financeiro-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
