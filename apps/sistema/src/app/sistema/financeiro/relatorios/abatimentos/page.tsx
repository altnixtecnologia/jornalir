import Link from "next/link";
import { ADJUSTMENT_TYPE_LABELS } from "@ir/types";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ReportFiltersToggle } from "../../../../../features/financeiro/ReportFiltersToggle";
import { getClientService } from "../../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { listReceivableAdjustmentsReportSupabase } from "../../../../../providers/supabase/receivableRepository.supabase";
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
 * Relatório de Abatimentos (Parte 3B, item 13) — visão simples, uma
 * linha por abatimento VÁLIDO. Filtra por período/cliente/usuário.
 */
export default async function RelatorioAbatimentosPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const clientId = one(searchParams?.clientId);
  const recordedBy = one(searchParams?.recordedBy);
  const recordedFrom = one(searchParams?.recordedFrom);
  const recordedTo = one(searchParams?.recordedTo);

  const [clients, staff] = await Promise.all([getClientService(supabase).list(), listActiveStaffSupabase(supabase)]);

  const result = await listReceivableAdjustmentsReportSupabase(supabase, {
    page: 1,
    pageSize: 1000,
    clientId: clientId || undefined,
    recordedByProfileId: recordedBy || undefined,
    recordedFrom: recordedFrom || undefined,
    recordedTo: recordedTo || undefined,
  });

  const activeFilterCount = [clientId, recordedBy, recordedFrom, recordedTo].filter(Boolean).length;
  const total = result.adjustments.reduce((sum, item) => sum + item.amount, 0);

  return (
    <>
      <ModuleHeader
        eyebrow="FINANCEIRO / RELATÓRIOS / ABATIMENTOS"
        title="Relatório de abatimentos"
        description="Uma linha por abatimento válido — descontos, bonificações e quitações com diferença."
        action={
          <Link className="secondary-link" href="/sistema/financeiro/relatorios">
            Voltar para relatórios
          </Link>
        }
      />

      <ReportFiltersToggle activeFilterCount={activeFilterCount}>
        <form className="materias-filters-compact" method="get" action="/sistema/financeiro/relatorios/abatimentos">
          <select name="clientId" defaultValue={clientId} aria-label="Cliente" title="Cliente">
            <option value="">Cliente: todos</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.reference}
              </option>
            ))}
          </select>
          <label>
            Registrado de
            <input type="date" name="recordedFrom" defaultValue={recordedFrom} />
          </label>
          <label>
            Registrado até
            <input type="date" name="recordedTo" defaultValue={recordedTo} />
          </label>
          <select name="recordedBy" defaultValue={recordedBy} aria-label="Quem registrou" title="Quem registrou">
            <option value="">Quem registrou: todos</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <button type="submit">Filtrar</button>
        </form>
        <span className="materias-count">{result.total} abatimento(s) · {formatAmount(total)}</span>
      </ReportFiltersToggle>

      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Cliente</th>
              <th>Título</th>
              <th>Valor</th>
              <th>Motivo</th>
              <th>Tipo</th>
              <th>Quem autorizou</th>
              <th>Quem registrou</th>
              <th>Contrato/origem</th>
            </tr>
          </thead>
          <tbody>
            {result.adjustments.map((adjustment) => (
              <tr key={adjustment.id}>
                <td>{formatDateTime(adjustment.recordedAt)}</td>
                <td>{adjustment.clientName}</td>
                <td>{adjustment.receivableReference}</td>
                <td>{formatAmount(adjustment.amount)}</td>
                <td>{adjustment.reason}</td>
                <td>{ADJUSTMENT_TYPE_LABELS[adjustment.adjustmentType]}</td>
                <td>{staff.find((person) => person.id === adjustment.authorizedByProfileId)?.name ?? "—"}</td>
                <td>{staff.find((person) => person.id === adjustment.recordedByProfileId)?.name ?? "—"}</td>
                <td>{adjustment.contractId ? "Contrato institucional" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.adjustments.length === 0 ? <p className="helper-text">Nenhum abatimento encontrado com os filtros atuais.</p> : null}
      </div>
    </>
  );
}
