import Link from "next/link";
import type { PaymentMethod, ReceivableSourceType } from "@ir/types";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, RECEIVABLE_SOURCE_TYPE_LABELS, RECEIVABLE_SOURCE_TYPES } from "@ir/types";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ReportFiltersToggle } from "../../../../../features/financeiro/ReportFiltersToggle";
import { getClientService } from "../../../../../composition/clientes";
import { getContractService } from "../../../../../composition/financeiro";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { listReceivableReceiptsReportSupabase } from "../../../../../providers/supabase/receivableRepository.supabase";
import { listActiveStaffSupabase } from "../../../../../providers/supabase/staffRepository.supabase";

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
 * Relatório de Recebimentos (Parte 3B, item 12) — uma linha por
 * recebimento VÁLIDO, útil pra conferência diária/mensal de caixa.
 * Área de filtros recolhível, mesmo padrão da tela de Relatórios geral.
 */
export default async function RelatorioRecebimentosPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const clientId = one(searchParams?.clientId);
  const contractId = one(searchParams?.contractId);
  const sourceType = one(searchParams?.sourceType);
  const receivedFrom = one(searchParams?.receivedFrom);
  const receivedTo = one(searchParams?.receivedTo);
  const receivedBy = one(searchParams?.receivedBy);
  const recordedBy = one(searchParams?.recordedBy);
  const paymentMethod = one(searchParams?.paymentMethod);

  const [clients, contracts, staff] = await Promise.all([
    getClientService(supabase).list(),
    getContractService(supabase).list(),
    listActiveStaffSupabase(supabase),
  ]);

  const result = await listReceivableReceiptsReportSupabase(supabase, {
    page: 1,
    pageSize: 1000,
    clientId: clientId || undefined,
    contractId: contractId || undefined,
    sourceType: RECEIVABLE_SOURCE_TYPES.includes(sourceType as ReceivableSourceType) ? (sourceType as ReceivableSourceType) : undefined,
    receivedFrom: receivedFrom || undefined,
    receivedTo: receivedTo || undefined,
    receivedByProfileId: receivedBy || undefined,
    recordedByProfileId: recordedBy || undefined,
    paymentMethod: PAYMENT_METHODS.includes(paymentMethod as PaymentMethod) ? (paymentMethod as PaymentMethod) : undefined,
  });

  const activeFilterCount = [clientId, contractId, sourceType, receivedFrom, receivedTo, receivedBy, recordedBy, paymentMethod].filter(
    Boolean,
  ).length;

  const total = result.receipts.reduce((sum, item) => sum + item.amount, 0);

  return (
    <>
      <ModuleHeader
        eyebrow="FINANCEIRO / RELATÓRIOS / RECEBIMENTOS"
        title="Relatório de recebimentos"
        description="Uma linha por recebimento válido — conferência diária/mensal de caixa."
        action={
          <Link className="secondary-link" href="/sistema/financeiro/relatorios">
            Voltar para relatórios
          </Link>
        }
      />

      <ReportFiltersToggle activeFilterCount={activeFilterCount}>
        <form className="materias-filters-compact" method="get" action="/sistema/financeiro/relatorios/recebimentos">
          <select name="clientId" defaultValue={clientId} aria-label="Cliente" title="Cliente">
            <option value="">Cliente: todos</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.reference}
              </option>
            ))}
          </select>
          <select name="contractId" defaultValue={contractId} aria-label="Contrato" title="Contrato">
            <option value="">Contrato: todos</option>
            {contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.reference}
              </option>
            ))}
          </select>
          <select name="sourceType" defaultValue={sourceType} aria-label="Origem" title="Origem">
            <option value="">Origem: todas</option>
            {RECEIVABLE_SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {RECEIVABLE_SOURCE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <label>
            Recebido de
            <input type="date" name="receivedFrom" defaultValue={receivedFrom} />
          </label>
          <label>
            Recebido até
            <input type="date" name="receivedTo" defaultValue={receivedTo} />
          </label>
          <select name="receivedBy" defaultValue={receivedBy} aria-label="Quem recebeu" title="Quem recebeu">
            <option value="">Quem recebeu: todos</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <select name="recordedBy" defaultValue={recordedBy} aria-label="Quem registrou" title="Quem registrou">
            <option value="">Quem registrou: todos</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <select name="paymentMethod" defaultValue={paymentMethod} aria-label="Forma de pagamento" title="Forma de pagamento">
            <option value="">Forma de pagamento: todas</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </select>
          <button type="submit">Filtrar</button>
        </form>
        <span className="materias-count">{result.total} recebimento(s) · {formatAmount(total)}</span>
      </ReportFiltersToggle>

      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Cliente</th>
              <th>Título</th>
              <th>Valor</th>
              <th>Forma</th>
              <th>Quem recebeu</th>
              <th>Quem registrou</th>
              <th>Registrado em</th>
              <th>Contrato/origem</th>
            </tr>
          </thead>
          <tbody>
            {result.receipts.map((receipt) => (
              <tr key={receipt.id}>
                <td>{formatDateTime(receipt.receivedAt)}</td>
                <td>{receipt.clientName}</td>
                <td>{receipt.receivableReference}</td>
                <td>{formatAmount(receipt.amount)}</td>
                <td>{receipt.paymentMethod ? PAYMENT_METHOD_LABELS[receipt.paymentMethod] : "—"}</td>
                <td>{staff.find((person) => person.id === receipt.receivedByProfileId)?.name ?? "—"}</td>
                <td>{staff.find((person) => person.id === receipt.recordedByProfileId)?.name ?? "—"}</td>
                <td>{formatDateTime(receipt.recordedAt)}</td>
                <td>{receipt.contractId ? "Contrato institucional" : RECEIVABLE_SOURCE_TYPE_LABELS[receipt.sourceType]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.receipts.length === 0 ? <p className="helper-text">Nenhum recebimento encontrado com os filtros atuais.</p> : null}
      </div>
    </>
  );
}
