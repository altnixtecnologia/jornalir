import type { PaymentMethod, ReceivableSourceType, ReceivableStatus } from "@ir/types";
import { PAYMENT_METHODS, RECEIVABLE_SOURCE_TYPE_LABELS, RECEIVABLE_SOURCE_TYPES, RECEIVABLE_STATUS_LABELS, RECEIVABLE_STATUSES } from "@ir/types";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { listReceivablesAdminPageSupabase } from "../../../../../providers/supabase/receivableRepository.supabase";
import { getClientService } from "../../../../../composition/clientes";
import { PrintButton } from "../../../../../features/financeiro/PrintButton";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function clientDoc(client: { kind: "individual" | "company"; cpf?: string; cnpj?: string } | undefined): string {
  if (!client) return "—";
  return (client.kind === "company" ? client.cnpj : client.cpf) || "—";
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Exportação real em PDF (Parte 3B, item 11) — página própria otimizada
 * pra impressão (@media print no globals.css), usando o "imprimir como
 * PDF" nativo do navegador. Deliberadamente NÃO é uma captura de tela:
 * é HTML real, com paginação/fonte controladas por CSS de impressão, daí
 * "PDF deve ser legível". Não adiciona nenhuma dependência nova de
 * geração de PDF no servidor.
 */
export default async function RelatorioImprimirPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const status = one(searchParams?.status);
  const sourceType = one(searchParams?.sourceType);
  const paymentMethod = one(searchParams?.paymentMethod);

  const [result, clients] = await Promise.all([
    listReceivablesAdminPageSupabase(supabase, {
      page: 1,
      pageSize: 1000,
      search: one(searchParams?.q),
      status: RECEIVABLE_STATUSES.includes(status as ReceivableStatus) ? (status as ReceivableStatus) : undefined,
      sourceType: RECEIVABLE_SOURCE_TYPES.includes(sourceType as ReceivableSourceType) ? (sourceType as ReceivableSourceType) : undefined,
      dueFrom: one(searchParams?.dueFrom) || undefined,
      dueTo: one(searchParams?.dueTo) || undefined,
      competencyFrom: one(searchParams?.competencyFrom) || undefined,
      competencyTo: one(searchParams?.competencyTo) || undefined,
      contractId: one(searchParams?.contractId) || undefined,
      receivedByProfileId: one(searchParams?.receivedBy) || undefined,
      recordedByProfileId: one(searchParams?.recordedBy) || undefined,
      paymentMethod: PAYMENT_METHODS.includes(paymentMethod as PaymentMethod) ? (paymentMethod as PaymentMethod) : undefined,
      settledWithDifferenceOnly: one(searchParams?.settledWithDifferenceOnly) === "1" || undefined,
      withBalanceOnly: one(searchParams?.withBalanceOnly) === "1" || undefined,
      partiallyPaidOnly: one(searchParams?.partiallyPaidOnly) === "1" || undefined,
    }),
    getClientService(supabase).list(),
  ]);

  const clientById = new Map(clients.map((client) => [client.id, client]));

  const totals = result.receivables.reduce(
    (acc, item) => ({
      original: acc.original + item.originalAmount,
      received: acc.received + item.totalReceived,
      adjustments: acc.adjustments + item.totalAdjustments,
      balance: acc.balance + item.balance,
    }),
    { original: 0, received: 0, adjustments: 0, balance: 0 },
  );

  return (
    <div className="print-report">
      <div className="print-report-toolbar">
        <PrintButton />
      </div>
      <h1>Relatório financeiro — contas a receber</h1>
      <p className="print-report-meta">Gerado em {new Date().toLocaleString("pt-BR")} · {result.total} título(s)</p>

      <table className="print-report-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>CPF/CNPJ</th>
            <th>Descrição</th>
            <th>Origem</th>
            <th>Competência</th>
            <th>Vencimento</th>
            <th>Valor original</th>
            <th>Recebido</th>
            <th>Abatimentos</th>
            <th>Saldo</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          {result.receivables.map((item) => (
            <tr key={item.id}>
              <td>{item.clientName}</td>
              <td>{clientDoc(clientById.get(item.clientId))}</td>
              <td>{item.description}</td>
              <td>{RECEIVABLE_SOURCE_TYPE_LABELS[item.sourceType]}</td>
              <td>{formatDate(item.competencyDate)}</td>
              <td>{formatDate(item.dueDate)}</td>
              <td>{formatAmount(item.originalAmount)}</td>
              <td>{formatAmount(item.totalReceived)}</td>
              <td>{formatAmount(item.totalAdjustments)}</td>
              <td>{formatAmount(item.balance)}</td>
              <td>{RECEIVABLE_STATUS_LABELS[item.status]}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6}>Totais</td>
            <td>{formatAmount(totals.original)}</td>
            <td>{formatAmount(totals.received)}</td>
            <td>{formatAmount(totals.adjustments)}</td>
            <td>{formatAmount(totals.balance)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
