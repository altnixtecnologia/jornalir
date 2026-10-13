import Link from "next/link";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { FinancePeriodCalendar } from "../../../features/financeiro/FinancePeriodCalendar";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import {
  getFinancialOverviewSupabase,
  type FinancialPeriodMetric,
} from "../../../providers/supabase/financialOverview.supabase";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString("pt-BR");
}

function localToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseYmd(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = parseYmd(value);
  date.setUTCDate(date.getUTCDate() + days);
  return ymd(date);
}

function weekRange(today: string): { start: string; end: string } {
  const date = parseYmd(today);
  const weekday = date.getUTCDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  const start = addDays(today, diff);
  return { start, end: addDays(start, 6) };
}

function monthRange(today: string): { start: string; end: string } {
  const [year, month] = today.split("-").map(Number);
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10),
  };
}

function validDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseYmd(value).getTime()));
}

function resolvePeriod(
  searchParams: { periodStart?: string | string[]; periodEnd?: string | string[] } | undefined,
  today: string,
): { start: string; end: string } {
  const fallback = weekRange(today);
  const rawStart = typeof searchParams?.periodStart === "string" ? searchParams.periodStart : undefined;
  const rawEnd = typeof searchParams?.periodEnd === "string" ? searchParams.periodEnd : undefined;

  if (!validDate(rawStart) || !validDate(rawEnd)) return fallback;
  const start = rawStart <= rawEnd ? rawStart : rawEnd;
  const end = rawStart <= rawEnd ? rawEnd : rawStart;

  const distanceDays = Math.round((parseYmd(end).getTime() - parseYmd(start).getTime()) / 86_400_000);
  if (distanceDays > 366) return fallback;
  return { start, end };
}

function MetricTile({
  title,
  metric,
  primary,
  href,
}: {
  title: string;
  metric: FinancialPeriodMetric;
  primary: "amount" | "count";
  href?: string;
}): JSX.Element {
  const value = primary === "amount" ? formatAmount(metric.amount) : String(metric.count);
  const detail =
    primary === "amount"
      ? `${metric.count} título${metric.count === 1 ? "" : "s"}`
      : formatAmount(metric.amount);

  const content = (
    <>
      <span className="quick-access-label">{value}</span>
      <span className="quick-access-description">{title}</span>
      <span className="helper-text" style={{ marginTop: 4 }}>{detail}</span>
    </>
  );

  return (
    <li>
      {href ? (
        <Link className="quick-access-card" href={href}>{content}</Link>
      ) : (
        <div className="quick-access-card" style={{ cursor: "default" }}>{content}</div>
      )}
    </li>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <li>
      <div className="quick-access-card" style={{ cursor: "default" }}>
        <span className="quick-access-label">{value}</span>
        <span className="quick-access-description">{label}</span>
      </div>
    </li>
  );
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams?: { periodStart?: string | string[]; periodEnd?: string | string[] };
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const today = localToday();
  const period = resolvePeriod(searchParams, today);
  const month = monthRange(today);

  const overview = await getFinancialOverviewSupabase(supabase, {
    today,
    periodStart: period.start,
    periodEnd: period.end,
    monthStart: month.start,
    monthEnd: month.end,
  });

  const periodLabel = `${formatDate(period.start)} até ${formatDate(period.end)}`;

  return (
    <>
      <ModuleHeader
        eyebrow="FINANCEIRO"
        title="Visão geral"
        description="Vencimentos, recebimentos e títulos em aberto por hoje, período escolhido e mês atual."
      />

      <section className="form-section" style={{ position: "relative", overflow: "visible" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <div>
            <h2 style={{ margin: 0 }}>Período de análise</h2>
            <p className="helper-text" style={{ margin: "5px 0 0" }}>
              Padrão: segunda a domingo. Clique uma vez para o início e outra para o fim.
            </p>
          </div>
          <FinancePeriodCalendar initialStart={period.start} initialEnd={period.end} today={today} />
        </div>
      </section>

      <section className="form-section">
        <h2>Vencimentos</h2>
        <ul className="quick-access-grid financeiro-kpi-grid">
          <MetricTile
            title={`Hoje · ${formatDate(today)}`}
            metric={overview.dueToday}
            primary="amount"
            href={`/sistema/financeiro/contas-a-receber?status=open&dueFrom=${today}&dueTo=${today}`}
          />
          <MetricTile
            title={`Período · ${periodLabel}`}
            metric={overview.duePeriod}
            primary="amount"
            href={`/sistema/financeiro/contas-a-receber?status=open&dueFrom=${period.start}&dueTo=${period.end}`}
          />
          <MetricTile
            title={`Mês · ${formatDate(month.start)} a ${formatDate(month.end)}`}
            metric={overview.dueMonth}
            primary="amount"
            href={`/sistema/financeiro/contas-a-receber?status=open&dueFrom=${month.start}&dueTo=${month.end}`}
          />
        </ul>
      </section>

      <section className="form-section">
        <h2>Recebidos</h2>
        <ul className="quick-access-grid financeiro-kpi-grid">
          <MetricTile title={`Hoje · ${formatDate(today)}`} metric={overview.receivedToday} primary="amount" />
          <MetricTile title={`Período · ${periodLabel}`} metric={overview.receivedPeriod} primary="amount" />
          <MetricTile title={`Mês · ${formatDate(month.start)} a ${formatDate(month.end)}`} metric={overview.receivedMonth} primary="amount" />
        </ul>
      </section>

      <section className="form-section">
        <h2>Títulos em aberto</h2>
        <ul className="quick-access-grid financeiro-kpi-grid">
          <MetricTile
            title={`Hoje · ${formatDate(today)}`}
            metric={overview.openToday}
            primary="count"
            href={`/sistema/financeiro/contas-a-receber?status=open&dueFrom=${today}&dueTo=${today}`}
          />
          <MetricTile
            title={`Período · ${periodLabel}`}
            metric={overview.openPeriod}
            primary="count"
            href={`/sistema/financeiro/contas-a-receber?status=open&dueFrom=${period.start}&dueTo=${period.end}`}
          />
          <MetricTile
            title={`Mês · ${formatDate(month.start)} a ${formatDate(month.end)}`}
            metric={overview.openMonth}
            primary="count"
            href={`/sistema/financeiro/contas-a-receber?status=open&dueFrom=${month.start}&dueTo=${month.end}`}
          />
        </ul>
      </section>

      <section className="form-section">
        <h2>Resumo geral</h2>
        <ul className="quick-access-grid financeiro-kpi-grid">
          <SummaryTile label={`Vencidos · ${overview.overdueCount} título(s)`} value={formatAmount(overview.totalOverdueAmount)} />
          <SummaryTile label="Saldo total em aberto" value={formatAmount(overview.totalOpenAmount)} />
          <SummaryTile label="Abatimentos no período" value={formatAmount(overview.adjustmentsInPeriod)} />
          <SummaryTile label="Parcialmente pagos" value={String(overview.partiallyPaidCount)} />
        </ul>
      </section>

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
