import type { PaymentMethod, ReceivableSourceType, ReceivableStatus } from "@ir/types";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, RECEIVABLE_SOURCE_TYPE_LABELS, RECEIVABLE_SOURCE_TYPES, RECEIVABLE_STATUS_LABELS, RECEIVABLE_STATUSES } from "@ir/types";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { ReceivablesList } from "../../../../features/financeiro/ReceivablesList";
import { getContractService } from "../../../../composition/financeiro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { listReceivablesAdminPageSupabase } from "../../../../providers/supabase/receivableRepository.supabase";
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
  const search = one(searchParams?.q).trim();
  const contractId = one(searchParams?.contractId);
  const receivedBy = one(searchParams?.receivedBy);
  const recordedBy = one(searchParams?.recordedBy);
  const paymentMethod = one(searchParams?.paymentMethod);

  const [contracts, staff] = await Promise.all([getContractService(supabase).list(), listActiveStaffSupabase(supabase)]);

  const result = await listReceivablesAdminPageSupabase(supabase, {
    page: 1,
    pageSize: 100,
    search,
    status: RECEIVABLE_STATUSES.includes(status as ReceivableStatus) ? (status as ReceivableStatus) : undefined,
    sourceType: RECEIVABLE_SOURCE_TYPES.includes(sourceType as ReceivableSourceType) ? (sourceType as ReceivableSourceType) : undefined,
    dueFrom: dueFrom || undefined,
    dueTo: dueTo || undefined,
    contractId: contractId || undefined,
    receivedByProfileId: receivedBy || undefined,
    recordedByProfileId: recordedBy || undefined,
    paymentMethod: PAYMENT_METHODS.includes(paymentMethod as PaymentMethod) ? (paymentMethod as PaymentMethod) : undefined,
  });

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
    <>
      <ModuleHeader
        eyebrow="FINANCEIRO / RELATÓRIOS"
        title="Relatórios"
        description="Filtros sobre contas a receber — exportação (PDF/Excel) fica para uma fase futura; os mesmos filtros e consulta já suportam isso depois."
      />

      <form className="materias-toolbar" method="get" action="/sistema/financeiro/relatorios">
        <div className="materias-filters">
          <label className="materias-search">
            Cliente / CPF / CNPJ / descrição / referência
            <input name="q" type="search" defaultValue={search} />
          </label>
          <label>
            Situação
            <select name="status" defaultValue={status}>
              <option value="">Todas</option>
              {RECEIVABLE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {RECEIVABLE_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Origem
            <select name="sourceType" defaultValue={sourceType}>
              <option value="">Todas</option>
              {RECEIVABLE_SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {RECEIVABLE_SOURCE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Contrato
            <select name="contractId" defaultValue={contractId}>
              <option value="">Todos</option>
              {contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.reference}
                </option>
              ))}
            </select>
          </label>
          <label>
            Vencimento de
            <input type="date" name="dueFrom" defaultValue={dueFrom} />
          </label>
          <label>
            Vencimento até
            <input type="date" name="dueTo" defaultValue={dueTo} />
          </label>
          <label>
            Quem recebeu
            <select name="receivedBy" defaultValue={receivedBy}>
              <option value="">Todos</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quem registrou
            <select name="recordedBy" defaultValue={recordedBy}>
              <option value="">Todos</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Forma de pagamento
            <select name="paymentMethod" defaultValue={paymentMethod}>
              <option value="">Todas</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Filtrar</button>
        </div>
        <span className="materias-count">{result.total} título(s) no filtro atual</span>
      </form>

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
            <span>{formatAmount(totals.adjustments)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Saldo em aberto</span>
            <span>{formatAmount(totals.balance)}</span>
          </div>
        </div>
        <div className="form-actions" style={{ marginTop: "12px" }}>
          <button type="button" disabled title="Exportação em fase futura">
            Exportar PDF (em breve)
          </button>
          <button type="button" disabled title="Exportação em fase futura">
            Exportar planilha (em breve)
          </button>
        </div>
      </section>

      <ReceivablesList receivables={result.receivables} />
    </>
  );
}
