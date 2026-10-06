import Link from "next/link";
import type { ContractStatus } from "@ir/types";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUSES,
  clientDisplayName,
  computeEffectiveContractAmount,
  computeEffectiveContractEndsAt,
} from "@ir/types";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ReportFiltersToggle } from "../../../../../features/financeiro/ReportFiltersToggle";
import { getClientService } from "../../../../../composition/clientes";
import { getContractService } from "../../../../../composition/financeiro";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { listAmendmentsForContractsSupabase } from "../../../../../providers/supabase/contractRepository.supabase";
import { listReceivablesForContractsSupabase } from "../../../../../providers/supabase/receivableRepository.supabase";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatAmount(value?: number): string {
  if (value === undefined) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Relatório de Contratos (Bloco 2, item 10) — reaproveita a mesma
 * infraestrutura dos relatórios de Financeiro (ReportFiltersToggle,
 * sem exportação nova de propósito: a tela já é a "exportação" visual,
 * e a tabela pode ser impressa pelo navegador como as demais). Saldo
 * CONTRATUAL e saldo FINANCEIRO aparecem como colunas distintas, nunca
 * misturadas (mesmo princípio da página de detalhe do contrato).
 */
export default async function RelatorioContratosPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const clientId = one(searchParams?.clientId);
  const status = one(searchParams?.status);
  const contractId = one(searchParams?.contractId);
  const endsFrom = one(searchParams?.endsFrom);
  const endsTo = one(searchParams?.endsTo);
  const withContractualBalanceOnly = one(searchParams?.withContractualBalanceOnly) === "1";
  const withFinancialBalanceOnly = one(searchParams?.withFinancialBalanceOnly) === "1";

  const [clients, allContracts] = await Promise.all([
    getClientService(supabase).list(),
    getContractService(supabase).list({
      clientId: clientId || undefined,
      status: CONTRACT_STATUSES.includes(status as ContractStatus) ? (status as ContractStatus) : undefined,
    }),
  ]);
  const contracts = contractId ? allContracts.filter((contract) => contract.id === contractId) : allContracts;
  const clientById = new Map(clients.map((client) => [client.id, client]));

  const contractIds = contracts.map((contract) => contract.id);
  const [amendments, receivables] = await Promise.all([
    listAmendmentsForContractsSupabase(supabase, contractIds),
    listReceivablesForContractsSupabase(supabase, contractIds),
  ]);
  const amendmentsByContract = new Map<string, typeof amendments>();
  for (const amendment of amendments) {
    amendmentsByContract.set(amendment.contractId, [...(amendmentsByContract.get(amendment.contractId) ?? []), amendment]);
  }
  const receivablesByContract = new Map<string, typeof receivables>();
  for (const receivable of receivables) {
    if (!receivable.contractId) continue;
    receivablesByContract.set(receivable.contractId, [...(receivablesByContract.get(receivable.contractId) ?? []), receivable]);
  }

  const rows = contracts
    .map((contract) => {
      const contractAmendments = amendmentsByContract.get(contract.id) ?? [];
      const contractReceivables = receivablesByContract.get(contract.id) ?? [];
      const effectiveAmount = computeEffectiveContractAmount(contract.contractedAmount, contractAmendments);
      const effectiveEndsAt = computeEffectiveContractEndsAt(contract.endsAt, contractAmendments);
      const billedAmount = contractReceivables.reduce((sum, item) => sum + item.originalAmount, 0);
      const receivedAmount = contractReceivables.reduce((sum, item) => sum + item.totalReceived, 0);
      const adjustmentsAmount = contractReceivables.reduce((sum, item) => sum + item.totalAdjustments, 0);
      const financialBalance = billedAmount - receivedAmount - adjustmentsAmount;
      const contractualBalance = effectiveAmount !== undefined ? effectiveAmount - billedAmount : undefined;
      return { contract, effectiveAmount, effectiveEndsAt, billedAmount, receivedAmount, financialBalance, contractualBalance };
    })
    .filter((row) => {
      if (endsFrom && (!row.effectiveEndsAt || row.effectiveEndsAt < endsFrom)) return false;
      if (endsTo && (!row.effectiveEndsAt || row.effectiveEndsAt > endsTo)) return false;
      if (withContractualBalanceOnly && !(row.contractualBalance !== undefined && row.contractualBalance > 0)) return false;
      if (withFinancialBalanceOnly && !(row.financialBalance > 0)) return false;
      return true;
    });

  const activeFilterCount = [clientId, status, contractId, endsFrom, endsTo, withContractualBalanceOnly, withFinancialBalanceOnly].filter(
    Boolean,
  ).length;

  return (
    <>
      <ModuleHeader
        eyebrow="FINANCEIRO / RELATÓRIOS / CONTRATOS"
        title="Relatório de contratos institucionais"
        description="Vigência, valor vigente, lançado, recebido, saldo contratual e saldo financeiro — por contrato."
        action={
          <Link className="secondary-link" href="/sistema/financeiro/relatorios">
            Voltar para relatórios
          </Link>
        }
      />

      <ReportFiltersToggle activeFilterCount={activeFilterCount}>
        <form className="materias-filters-compact" method="get" action="/sistema/financeiro/relatorios/contratos">
          <select name="clientId" defaultValue={clientId} aria-label="Cliente/órgão" title="Cliente/órgão">
            <option value="">Cliente/órgão: todos</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.reference}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={status} aria-label="Status" title="Status">
            <option value="">Status: todos</option>
            {CONTRACT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {CONTRACT_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
          <select name="contractId" defaultValue={contractId} aria-label="Contrato" title="Contrato">
            <option value="">Contrato: todos</option>
            {allContracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.reference}
              </option>
            ))}
          </select>
          <label>
            Vigência termina de
            <input type="date" name="endsFrom" defaultValue={endsFrom} />
          </label>
          <label>
            Vigência termina até
            <input type="date" name="endsTo" defaultValue={endsTo} />
          </label>
          <label className="materias-checkbox-compact">
            <input type="checkbox" name="withContractualBalanceOnly" value="1" defaultChecked={withContractualBalanceOnly} />
            Com saldo contratual
          </label>
          <label className="materias-checkbox-compact">
            <input type="checkbox" name="withFinancialBalanceOnly" value="1" defaultChecked={withFinancialBalanceOnly} />
            Com saldo financeiro
          </label>
          <button type="submit">Filtrar</button>
        </form>
        <span className="materias-count">{rows.length} contrato(s)</span>
      </ReportFiltersToggle>

      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>Órgão</th>
              <th>Contrato</th>
              <th>Objeto</th>
              <th>Vigência</th>
              <th>Valor vigente</th>
              <th>Lançado</th>
              <th>Recebido</th>
              <th>Saldo contratual</th>
              <th>Saldo financeiro</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ contract, effectiveAmount, effectiveEndsAt, billedAmount, receivedAmount, financialBalance, contractualBalance }) => (
              <tr key={contract.id}>
                <td>
                  <Link className="materia-title-link" href={`/sistema/financeiro/contratos/${contract.id}`}>
                    {clientById.get(contract.clientId) ? clientDisplayName(clientById.get(contract.clientId)!) : "—"}
                  </Link>
                </td>
                <td>{contract.reference}</td>
                <td>{contract.object || "—"}</td>
                <td>{formatDate(contract.startsAt)} – {formatDate(effectiveEndsAt)}</td>
                <td>{formatAmount(effectiveAmount)}</td>
                <td>{formatAmount(billedAmount)}</td>
                <td>{formatAmount(receivedAmount)}</td>
                <td>{contractualBalance !== undefined ? formatAmount(contractualBalance) : "—"}</td>
                <td>{formatAmount(financialBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="helper-text">Nenhum contrato encontrado com os filtros atuais.</p> : null}
      </div>
    </>
  );
}
