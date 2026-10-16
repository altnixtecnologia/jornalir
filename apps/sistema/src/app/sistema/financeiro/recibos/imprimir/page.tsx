import { PAYMENT_METHOD_LABELS } from "@ir/types";
import { PrintButton } from "../../../../../features/financeiro/PrintButton";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { listAllReceiptsForPrintSupabase, type ReceiptRecordStatus } from "../../../../../providers/supabase/receivableRepository.supabase";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Cartela de recibos (Fase 7.1) — "Imprimir todos" (?status=) respeita
 * SEMPRE o filtro atual (nunca imprime cancelados por engano); "Imprimir
 * selecionados"/individual (?ids=) imprime só os ids escolhidos, de
 * qualquer status. Desenho do recibo em si ainda é provisório — só a
 * infra de impressão (cartela, quebra de página, sem menu) está pronta;
 * o modelo final depende de uma amostra que o usuário vai enviar.
 */
export default async function RecibosPrintPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const idsParam = one(searchParams?.ids);
  const statusParam = one(searchParams?.status);
  const status: ReceiptRecordStatus = statusParam === "all" || statusParam === "cancelled" ? statusParam : "active";

  const result = await listAllReceiptsForPrintSupabase(supabase, { status: idsParam ? "all" : status });
  const ids = idsParam ? new Set(idsParam.split(",").filter(Boolean)) : null;
  const receipts = ids ? result.receipts.filter((receipt) => ids.has(receipt.id)) : result.receipts;

  return (
    <div className="receipt-cards">
      <div className="receipt-cards-toolbar">
        <PrintButton />
      </div>
      <h1>Cartela de recibos</h1>
      <p className="print-report-meta">
        Gerado em {new Date().toLocaleString("pt-BR")} · {receipts.length} recibo(s)
      </p>

      <div className="receipt-cards-grid">
        {receipts.map((receipt) => (
          <div className="receipt-card" key={receipt.id}>
            <h2>Recibo — {receipt.receivableReference}</h2>
            <dl>
              <dt>Cliente</dt>
              <dd>{receipt.clientName}</dd>
              <dt>Valor</dt>
              <dd>{formatAmount(receipt.amount)}</dd>
              <dt>Data</dt>
              <dd>{formatDateTime(receipt.receivedAt)}</dd>
              <dt>Forma</dt>
              <dd>{receipt.paymentMethod ? PAYMENT_METHOD_LABELS[receipt.paymentMethod] : "—"}</dd>
              <dt>Referência</dt>
              <dd>{receipt.receivableDescription}</dd>
              {receipt.reversedAt ? (
                <>
                  <dt>Status</dt>
                  <dd>Cancelado em {formatDateTime(receipt.reversedAt)}</dd>
                </>
              ) : null}
            </dl>
          </div>
        ))}
      </div>
      {receipts.length === 0 ? <p className="helper-text">Nenhum recibo encontrado.</p> : null}
    </div>
  );
}
