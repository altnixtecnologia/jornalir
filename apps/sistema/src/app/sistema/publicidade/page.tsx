import Link from "next/link";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getCommercialSaleService } from "../../../composition/comercial";
import { listCommercialProposalsWithTotalsSupabase } from "../../../providers/supabase/commercialProposalRepository.supabase";

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
 * Visão geral do módulo Comercial/Publicidade — KPIs só vêm de somas/
 * contagens reais sobre as vendas já carregadas (nunca número
 * inventado); "A receber" fica fora daqui nesta primeira versão por
 * depender de uma consulta própria ao Financeiro — ver relatório da
 * tarefa.
 */
export default async function CommercialOverviewPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const [sales, proposals, requestsResult] = await Promise.all([
    getCommercialSaleService(supabase).list(),
    listCommercialProposalsWithTotalsSupabase(supabase),
    supabase.from("site_interest_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);

  const active = sales.filter((sale) => sale.status === "active").length;
  const contracted = sales.filter((sale) => sale.status !== "cancelled").reduce((sum, sale) => sum + sale.amount, 0);
  const openProposals = proposals.filter((proposal) => proposal.status === "draft" || proposal.status === "sent").length;
  const newSiteRequests = requestsResult.count ?? 0;

  return (
    <>
      <ModuleHeader
        eyebrow="COMERCIAL"
        title="Comercial"
        description="Propostas, vendas, produtos/serviços e vínculo com o Financeiro — cliente sempre vem do Cadastro mestre."
        action={
          <Link className="form-action-primary" href="/sistema/publicidade/propostas/novo">
            + Nova proposta
          </Link>
        }
      />

      <ul className="quick-access-grid financeiro-kpi-grid">
        <Tile label="Solicitações novas do site" value={String(newSiteRequests)} href="/sistema/publicidade/solicitacoes" />
        <Tile label="Propostas em aberto" value={String(openProposals)} href="/sistema/publicidade/propostas" />
        <Tile label="Vendas em veiculação" value={String(active)} href="/sistema/publicidade/vendas?status=active" />
        <Tile label="Faturamento contratado" value={formatAmount(contracted)} href="/sistema/publicidade/vendas" />
      </ul>

      <section className="form-section">
        <h2>Acesso rápido</h2>
        <div className="form-actions">
          <Link href="/sistema/publicidade/solicitacoes">Solicitações do site</Link>
          <Link href="/sistema/publicidade/propostas">Propostas/Orçamentos</Link>
          <Link href="/sistema/publicidade/vendas">Vendas</Link>
          <Link href="/sistema/publicidade/produtos">Produtos/serviços</Link>
        </div>
        <p className="helper-text" style={{ marginTop: "12px" }}>
          O cliente/anunciante é sempre o Cadastro mestre (client_roles ganha o papel "anunciante" automaticamente ao criar a primeira venda). O Financeiro gerado aqui usa a mesma Conta a Receber do restante do sistema — nunca uma tabela financeira paralela.
        </p>
      </section>
    </>
  );
}
