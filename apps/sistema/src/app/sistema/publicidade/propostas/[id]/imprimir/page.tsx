import { notFound } from "next/navigation";
import { CommercialProposalNotFoundError } from "@ir/core";
import { clientDisplayName, computeProposalItemTotal, COMMERCIAL_CONDITION_LABELS } from "@ir/types";
import { getCommercialProposalService } from "../../../../../../composition/comercial";
import { getClientService } from "../../../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";
import { PrintButton } from "../../../../../../features/financeiro/PrintButton";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Proposta impressa/PDF (primeira versão) — mesmo padrão já usado nos
 * relatórios de Financeiro/Comercial (print-report + @media print do
 * globals.css, nenhuma dependência nova). "Preparar para PDF" aqui é o
 * "imprimir como PDF" nativo do navegador — HTML real, não captura de tela.
 */
export default async function CommercialProposalPrintPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const proposal = await getCommercialProposalService(supabase)
    .getWithItems(params.id)
    .catch((error: unknown) => {
      if (error instanceof CommercialProposalNotFoundError) return null;
      throw error;
    });
  if (!proposal) notFound();

  const client = await getClientService(supabase).getById(proposal.clientId);

  return (
    <div className="print-report">
      <div className="print-report-toolbar">
        <PrintButton />
      </div>
      <h1>Proposta comercial — {proposal.reference}</h1>
      <p className="print-report-meta">
        Cliente: {clientDisplayName(client)} · Data: {formatDate(proposal.proposalDate)} · Validade: {formatDate(proposal.validUntil)} · Condição: {COMMERCIAL_CONDITION_LABELS[proposal.commercialCondition]}
      </p>

      <table className="print-report-table">
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Qtd.</th>
            <th>Valor unit.</th>
            <th>Desconto</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {proposal.items.map((item) => (
            <tr key={item.id}>
              <td>{item.description}</td>
              <td>{item.quantity}</td>
              <td>{formatAmount(item.unitPrice)}</td>
              <td>{item.discountAmount > 0 ? formatAmount(item.discountAmount) : "—"}</td>
              <td>{formatAmount(computeProposalItemTotal(item))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>Total</td>
            <td>{formatAmount(proposal.total)}</td>
          </tr>
        </tfoot>
      </table>

      {proposal.notes ? (
        <p style={{ marginTop: "16px" }}>
          <strong>Observações:</strong> {proposal.notes}
        </p>
      ) : null}
    </div>
  );
}
