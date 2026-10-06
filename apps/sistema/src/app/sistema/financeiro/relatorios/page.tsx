import Link from "next/link";
import type { PaymentMethod, ReceivableSourceType, ReceivableStatus } from "@ir/types";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, RECEIVABLE_SOURCE_TYPE_LABELS, RECEIVABLE_SOURCE_TYPES, RECEIVABLE_STATUS_LABELS, RECEIVABLE_STATUSES } from "@ir/types";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { ReceivablesList } from "../../../../features/financeiro/ReceivablesList";
import { ReportFiltersToggle } from "../../../../features/financeiro/ReportFiltersToggle";
import { getContractService } from "../../../../composition/financeiro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { listReceivablesAdminPageSupabase, sumCreditAppliedForReceivables } from "../../../../providers/supabase/receivableRepository.supabase";
import { listActiveStaffSupabase } from "../../../../providers/supabase/staffRepository.supabase";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Relatórios (Parte 3A, item 20 + ajuste final item 4) — filtros reais
 * contra o banco, incluindo contrato/quem recebeu/quem registrou/forma
 * de pagamento (os três últimos resolvidos contra receivable_receipts
 * via findReceivableIdsByReceiptFilters — "quem recebeu" e "quem
 * registrou" continuam filtros DISTINTOS). SEM exportação completa
 * (PDF/Excel) nesta fase. A consulta já distingue valor originalmente
 * lançado, recebido, descontos/abatimentos e saldo em aberto.
 */
export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const status = one(searchParams?.status);
  const sourceType = one(searchParams?.sourceType);
  const dueFrom = one(searchParams?.dueFrom);
  const dueTo = one(searchParams?.dueTo);
  const competencyFrom = one(searchParams?.competencyFrom);
  const competencyTo = one(searchParams?.competencyTo);
  const search = one(searchParams?.q).trim();
  const contractId = one(searchParams?.contractId);
  const receivedBy = one(searchParams?.receivedBy);
  const recordedBy = one(searchParams?.recordedBy);
  const paymentMethod = one(searchParams?.paymentMethod);
  const settledWithDifferenceOnly = one(searchParams?.settledWithDifferenceOnly) === "1";
  const withBalanceOnly = one(searchParams?.withBalanceOnly) === "1";
  const partiallyPaidOnly = one(searchParams?.partiallyPaidOnly) === "1";

  const [contracts, staff] = await Promise.all([getContractService(supabase).list(), listActiveStaffSupabase(supabase)]);

  const filterQuery = {
    search,
    status: RECEIVABLE_STATUSES.includes(status as ReceivableStatus) ? (status as ReceivableStatus) : undefined,
    sourceType: RECEIVABLE_SOURCE_TYPES.includes(sourceType as ReceivableSourceType) ? (sourceType as ReceivableSourceType) : undefined,
    dueFrom: dueFrom || undefined,
    dueTo: dueTo || undefined,
    competencyFrom: competencyFrom || undefined,
    competencyTo: competencyTo || undefined,
    contractId: contractId || undefined,
    receivedByProfileId: receivedBy || undefined,
    recordedByProfileId: recordedBy || undefined,
    paymentMethod: PAYMENT_METHODS.includes(paymentMethod as PaymentMethod) ? (paymentMethod as PaymentMethod) : undefined,
    settledWithDifferenceOnly: settledWithDifferenceOnly || undefined,
    withBalanceOnly: withBalanceOnly || undefined,
    partiallyPaidOnly: partiallyPaidOnly || undefined,
  };

  const result = await listReceivablesAdminPageSupabase(supabase, {
    page: 1,
    pageSize: 100,
    ...filterQuery,
  });

  const activeFilterCount = [
    search.length > 0,
    Boolean(status),
    Boolean(sourceType),
    Boolean(contractId),
    Boolean(dueFrom),
    Boolean(dueTo),
    Boolean(competencyFrom),
    Boolean(competencyTo),
    Boolean(receivedBy),
    Boolean(recordedBy),
    Boolean(paymentMethod),
    settledWithDifferenceOnly,
    withBalanceOnly,
    partiallyPaidOnly,
  ].filter(Boolean).length;

  const exportQueryString = new URLSearchParams(
    Object.entries({
      q: search,
      status,
      sourceType,
      contractId,
      dueFrom,
      dueTo,
      competencyFrom,
      competencyTo,
      receivedBy,
      recordedBy,
      paymentMethod,
      settledWithDifferenceOnly: settledWithDifferenceOnly ? "1" : "",
      withBalanceOnly: withBalanceOnly ? "1" : "",
      partiallyPaidOnly: partiallyPaidOnly ? "1" : "",
    }).filter(([, value]) => value),
  ).toString();

  const totals = result.receivables.reduce(
    (acc, item) => ({
      original: acc.original + item.originalAmount,
      received: acc.received + item.totalReceived,
      adjustments: acc.adjustments + item.totalAdjustments,
      balance: acc.balance + item.balance,
    }),
    { original: 0, received: 0, adjustments: 0, balance: 0 },
  );
  // Crédito aplicado NUNCA é dinheiro novo recebido (Parte 3B.1, item
  // 18) — por isso é subtraído do total "Descontos/abatimentos" (que
  // hoje soma discount+settlement_difference+credit_applied) e mostrado
  // como linha própria.
  const creditApplied = await sumCreditAppliedForReceivables(supabase, result.receivables.map((item) => item.id));
  const realAdjustments = totals.adjustments - creditApplied;

  return (
    <>
      <ModuleHeader
        eyebrow="FINANCEIRO / RELATÓRIOS"
        title="Relatórios"
        description="Filtros sobre contas a receber, com exportação em CSV (planilha) e PDF (impressão) respeitando o filtro ativo."
        action={
          <div className="materias-toolbar-actions">
            <Link className="secondary-link" href="/sistema/financeiro/relatorios/recebimentos">
              Relatório de recebimentos
            </Link>
            <Link className="secondary-link" href="/sistema/financeiro/relatorios/abatimentos">
              Relatório de abatimentos
            </Link>
            <Link className="secondary-link" href="/sistema/financeiro/relatorios/creditos">
              Relatório de créditos
            </Link>
            <Link className="secondary-link" href="/sistema/financeiro/relatorios/contratos">
              Relatório de contratos
            </Link>
          </div>
        }
      />

      <ReportFiltersToggle activeFilterCount={activeFilterCount}>
        <form className="materias-filters-compact" method="get" action="/sistema/financeiro/relatorios">
          <label className="materias-search-compact">
            <span className="sr-only">Buscar</span>
            <input name="q" type="search" defaultValue={search} placeholder="Cliente / CPF / CNPJ / descrição / referência" />
          </label>
          <select name="status" defaultValue={status} aria-label="Situação" title="Situação">
            <option value="">Situação: todas</option>
            {RECEIVABLE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {RECEIVABLE_STATUS_LABELS[value]}
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
          <select name="contractId" defaultValue={contractId} aria-label="Contrato" title="Contrato">
            <option value="">Contrato: todos</option>
            {contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.reference}
              </option>
            ))}
          </select>
          <label>
            Vencimento de
            <input type="date" name="dueFrom" defaultValue={dueFrom} />
          </label>
          <label>
            Vencimento até
            <input type="date" name="dueTo" defaultValue={dueTo} />
          </label>
          <label>
            Competência de
            <input type="date" name="competencyFrom" defaultValue={competencyFrom} />
          </label>
          <label>
            Competência até
            <input type="date" name="competencyTo" defaultValue={competencyTo} />
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
          <label className="materias-checkbox-compact">
            <input type="checkbox" name="settledWithDifferenceOnly" value="1" defaultChecked={settledWithDifferenceOnly} />
            Quitado com abatimento
          </label>
          <label className="materias-checkbox-compact">
            <input type="checkbox" name="withBalanceOnly" value="1" defaultChecked={withBalanceOnly} />
            Só com saldo
          </label>
          <label className="materias-checkbox-compact">
            <input type="checkbox" name="partiallyPaidOnly" value="1" defaultChecked={partiallyPaidOnly} />
            Só recebimentos parciais
          </label>
          <button type="submit">Filtrar</button>
        </form>
        <span className="materias-count">{result.total} título(s) no filtro atual</span>
      </ReportFiltersToggle>

      <section className="form-section">
        <h2>Totais do filtro atual</h2>
        <div className="form-grid">
          <div className="form-field">
            <span className="field-label">Valor originalmente lançado</span>
            <span>{formatAmount(totals.original)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Valor efetivamente recebido</span>
            <span>{formatAmount(totals.received)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Descontos/abatimentos</span>
            <span>{formatAmount(realAdjustments)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Créditos aplicados</span>
            <span>{formatAmount(creditApplied)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Saldo em aberto</span>
            <span>{formatAmount(totals.balance)}</span>
          </div>
        </div>
        <p className="helper-text">Crédito aplicado nunca é contado como dinheiro novo recebido — é saldo que o próprio cliente já tinha.</p>
        <div className="form-actions" style={{ marginTop: "12px" }}>
          <Link className="form-action-primary" href={`/sistema/financeiro/relatorios/exportar?${exportQueryString}`}>
            Exportar planilha (CSV)
          </Link>
          <Link className="secondary-link" href={`/sistema/financeiro/relatorios/imprimir?${exportQueryString}`} target="_blank">
            Exportar PDF (imprimir)
          </Link>
        </div>
      </section>

      <ReceivablesList receivables={result.receivables} />
    </>
  );
}
