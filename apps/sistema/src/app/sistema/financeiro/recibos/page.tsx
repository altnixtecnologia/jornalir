import Link from "next/link";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { RecibosTable } from "../../../../features/financeiro/RecibosSelection";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { listReceiptsForRecibosSupabase, type ReceiptRecordStatus } from "../../../../providers/supabase/receivableRepository.supabase";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<ReceiptRecordStatus, string> = { active: "Ativos", all: "Todos", cancelled: "Cancelados" };

/**
 * Financeiro > Recibos (Fase 7) — reaproveita receivable_receipts (já
 * representa o recebimento real, "cancelado" = reversedAt), nenhuma
 * tabela nova. Pix fica registrado normalmente; dinheiro o operador
 * registra manualmente — ambos geram recibo aqui.
 */
export default async function RecibosPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const statusParam = one(searchParams?.status);
  const status: ReceiptRecordStatus = statusParam === "all" || statusParam === "cancelled" ? statusParam : "active";

  const result = await listReceiptsForRecibosSupabase(supabase, { status, page: 1, pageSize: 1000 });
  const total = result.receipts.reduce((sum, item) => sum + item.amount, 0);

  return (
    <>
      <ModuleHeader
        eyebrow="FINANCEIRO / RECIBOS"
        title="Recibos"
        description="Recibos de recebimentos (Pix e dinheiro) — emissão e impressão."
      />

      <div className="materias-toolbar">
        <div className="materias-filters-compact" role="tablist" aria-label="Filtro de status">
          {(["active", "all", "cancelled"] as ReceiptRecordStatus[]).map((option) => (
            <Link
              key={option}
              href={`/sistema/financeiro/recibos?status=${option}`}
              className={option === status ? "secondary-link is-active" : "secondary-link"}
              aria-current={option === status}
            >
              {STATUS_LABELS[option]}
            </Link>
          ))}
        </div>
        <Link className="secondary-link" href={`/sistema/financeiro/recibos/imprimir?status=${status}`}>
          Imprimir todos ({STATUS_LABELS[status].toLowerCase()})
        </Link>
      </div>

      <span className="materias-count">
        {result.total} recibo(s) · {formatAmount(total)}
      </span>

      <RecibosTable
        rows={result.receipts.map((receipt) => ({
          id: receipt.id,
          receivedAt: receipt.receivedAt,
          clientName: receipt.clientName,
          receivableReference: receipt.receivableReference,
          amount: receipt.amount,
          paymentMethod: receipt.paymentMethod,
          reversedAt: receipt.reversedAt,
        }))}
      />
    </>
  );
}
