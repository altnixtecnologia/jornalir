import Link from "next/link";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getFinancialOverviewSupabase } from "../../../providers/supabase/financialOverview.supabase";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Tile({ label, value, href }: { label: string; value: string; href?: string }): JSX.Element {
  const content = (
    <>
      <span className="quick-access-label">{value}</span>
      <span className="quick-access-description">{label}</span>
    </>
  );
  if (href) {
    return (
      <li>
        <Link className="quick-access-card" href={href}>
          {content}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <div className="quick-access-card" style={{ cursor: "default" }}>
        {content}
      </div>
    </li>
  );
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Visão geral financeira (Parte 3A, item 21) — números simples, sem
 * gráfico decorativo. Período considerado: mês corrente.
 */
export default async function FinanceiroPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const overview = await getFinancialOverviewSupabase(supabase, { periodStart, periodEnd });

  return (
    <>
      <ModuleHeader
        eyebrow="FINANCEIRO"
        title="Visão geral"
        description="Contas a receber, recebimentos e contratos institucionais. Período: mês corrente."
      />

      <ul className="quick-access-grid">
        <Tile label="Total a receber (aberto/parcial)" value={formatAmount(overview.totalOpenAmount)} href="/sistema/financeiro/contas-a-receber?status=open" />
        <Tile label="Total vencido" value={formatAmount(overview.totalOverdueAmount)} />
        <Tile label="Vencendo em breve (7 dias)" value={formatAmount(overview.dueSoonAmount)} />
        <Tile label="Recebido no período" value={formatAmount(overview.receivedInPeriod)} />
        <Tile label="Descontos/abatimentos no período" value={formatAmount(overview.adjustmentsInPeriod)} />
        <Tile label="Títulos em aberto" value={String(overview.openCount)} href="/sistema/financeiro/contas-a-receber?status=open" />
        <Tile label="Títulos parcialmente pagos" value={String(overview.partiallyPaidCount)} href="/sistema/financeiro/contas-a-receber?status=partially_paid" />
      </ul>

      <section className="form-section">
        <h2>Acesso rápido</h2>
        <div className="form-actions">
          <Link className="form-action-primary" href="/sistema/financeiro/contas-a-receber/novo">
            Novo lançamento
          </Link>
          <Link href="/sistema/financeiro/contas-a-receber">Contas a receber</Link>
          <Link href="/sistema/financeiro/contratos">Contratos institucionais</Link>
          <Link href="/sistema/financeiro/relatorios">Relatórios</Link>
        </div>
      </section>
    </>
  );
}
