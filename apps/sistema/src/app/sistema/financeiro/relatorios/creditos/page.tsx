import Link from "next/link";
import type { ReceivableSourceType } from "@ir/types";
import { RECEIVABLE_SOURCE_TYPE_LABELS, RECEIVABLE_SOURCE_TYPES } from "@ir/types";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ReportFiltersToggle } from "../../../../../features/financeiro/ReportFiltersToggle";
import { getClientService } from "../../../../../composition/clientes";
import { getClientCreditService } from "../../../../../composition/financeiro";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
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
 * Relatório de Créditos do cliente (Parte 3B.1, item 18) — créditos
 * gerados, aplicados e disponíveis, com origem/cliente/período/usuário.
 * Nunca confunde "crédito aplicado" com "recebimento" (ver relatório
 * geral, que já separa as duas colunas).
 */
export default async function RelatorioCreditosPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const clientId = one(searchParams?.clientId);
  const sourceType = one(searchParams?.sourceType);
  const onlyAvailable = one(searchParams?.onlyAvailable) === "1";

  const [clients, staff] = await Promise.all([getClientService(supabase).list(), listActiveStaffSupabase(supabase)]);

  const credits = await getClientCreditService(supabase).list({
    clientId: clientId || undefined,
    sourceType: RECEIVABLE_SOURCE_TYPES.includes(sourceType as ReceivableSourceType) ? (sourceType as ReceivableSourceType) : undefined,
    availableOnly: onlyAvailable || undefined,
  });

  const clientById = new Map(clients.map((client) => [client.id, client]));
  const activeFilterCount = [clientId, sourceType, onlyAvailable].filter(Boolean).length;

  const totals = credits.reduce(
    (acc, credit) => ({
      generated: acc.generated + credit.originalAmount,
      applied: acc.applied + credit.totalApplied,
      available: acc.available + credit.balance,
    }),
    { generated: 0, applied: 0, available: 0 },
  );

  return (
    <>
      <ModuleHeader
        eyebrow="FINANCEIRO / RELATÓRIOS / CRÉDITOS"
        title="Relatório de créditos do cliente"
        description="Créditos gerados por pagamento acima do devido — origem, aplicações e saldo disponível."
        action={
          <Link className="secondary-link" href="/sistema/financeiro/relatorios">
            Voltar para relatórios
          </Link>
        }
      />

      <ReportFiltersToggle activeFilterCount={activeFilterCount}>
        <form className="materias-filters-compact" method="get" action="/sistema/financeiro/relatorios/creditos">
          <select name="clientId" defaultValue={clientId} aria-label="Cliente" title="Cliente">
            <option value="">Cliente: todos</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.reference}
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
          <label className="materias-checkbox-compact">
            <input type="checkbox" name="onlyAvailable" value="1" defaultChecked={onlyAvailable} />
            Só com saldo disponível
          </label>
          <button type="submit">Filtrar</button>
        </form>
        <span className="materias-count">
          {credits.length} crédito(s) · gerado {formatAmount(totals.generated)} · aplicado {formatAmount(totals.applied)} · disponível {formatAmount(totals.available)}
        </span>
      </ReportFiltersToggle>

      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>Criado em</th>
              <th>Cliente</th>
              <th>Origem</th>
              <th>Valor original</th>
              <th>Aplicado</th>
              <th>Disponível</th>
              <th>Motivo</th>
              <th>Usuário</th>
              <th>Estornado</th>
            </tr>
          </thead>
          <tbody>
            {credits.map((credit) => (
              <tr key={credit.id}>
                <td>{formatDateTime(credit.createdAt)}</td>
                <td>{clientById.get(credit.clientId)?.reference ?? "—"}</td>
                <td>{RECEIVABLE_SOURCE_TYPE_LABELS[credit.sourceType]}</td>
                <td>{formatAmount(credit.originalAmount)}</td>
                <td>{formatAmount(credit.totalApplied)}</td>
                <td>{formatAmount(credit.balance)}</td>
                <td>{credit.reason ?? "—"}</td>
                <td>{staff.find((person) => person.id === credit.createdByProfileId)?.name ?? "—"}</td>
                <td>{credit.reversedAt ? "Sim" : "Não"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {credits.length === 0 ? <p className="helper-text">Nenhum crédito encontrado com os filtros atuais.</p> : null}
      </div>
    </>
  );
}
