import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ReceivableNotFoundError } from "@ir/core";
import { RECEIVABLE_SOURCE_TYPE_LABELS, RECEIVABLE_STATUS_LABELS, clientDisplayName } from "@ir/types";
import { ClientNotFoundError } from "@ir/core";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ReceivableActionsPanel } from "../../../../../features/financeiro/ReceivableActionsPanel";
import { ReceivableCreditPanel } from "../../../../../features/financeiro/ReceivableCreditPanel";
import { CompositionPaymentPanel } from "../../../../../features/financeiro/CompositionPaymentPanel";
import { getReceivableService, getClientCreditService } from "../../../../../composition/financeiro";
import { getClientService } from "../../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { listActiveStaffSupabase } from "../../../../../providers/supabase/staffRepository.supabase";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function Field({ label, value }: { label: string; value?: ReactNode }): JSX.Element {
  return (
    <div className="form-field">
      <span className="field-label">{label}</span>
      <span>{value || "—"}</span>
    </div>
  );
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReceivableDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const receivableService = getReceivableService(supabase);
  const receivable = await receivableService.getById(params.id).catch((error: unknown) => {
    if (error instanceof ReceivableNotFoundError) return null;
    throw error;
  });
  if (!receivable) notFound();

  const [client, receipts, adjustments, staff, { priorOpen, availableCredits, composition }, otherCredits] = await Promise.all([
    getClientService(supabase)
      .getById(receivable.clientId)
      .catch((error: unknown) => {
        if (error instanceof ClientNotFoundError) return null;
        throw error;
      }),
    receivableService.listReceipts(receivable.id),
    receivableService.listAdjustments(receivable.id),
    listActiveStaffSupabase(supabase),
    receivableService.getComposition(receivable.id),
    getClientCreditService(supabase).list({ clientId: receivable.clientId, availableOnly: true }),
  ]);
  const creditAppliedToThis = adjustments.filter((item) => item.adjustmentType === "credit_applied" && !item.reversedAt);
  const manuallyApplicableCredits = otherCredits.filter(
    (credit) => !availableCredits.some((sameOrigin) => sameOrigin.id === credit.id),
  );

  return (
    <>
      <ModuleHeader
        eyebrow={`FINANCEIRO / CONTAS A RECEBER / ${receivable.reference}`}
        title={receivable.description}
        description={client ? clientDisplayName(client) : "Cliente não encontrado"}
        action={
          <Link className="form-action-primary" href={`/sistema/financeiro/contas-a-receber/${receivable.id}/editar`}>
            Editar
          </Link>
        }
      />

      <section className="form-section form-section--first">
        <h2>Resumo</h2>
        <div className="form-grid">
          <Field
            label="Cliente"
            value={client ? <Link className="materia-title-link" href={`/sistema/clientes/${client.id}`}>{clientDisplayName(client)}</Link> : undefined}
          />
          <Field label="Origem" value={RECEIVABLE_SOURCE_TYPE_LABELS[receivable.sourceType]} />
          <Field label="Referência de origem" value={receivable.sourceReference} />
          <Field label="Valor original" value={formatAmount(receivable.originalAmount)} />
          <Field label="Total recebido" value={formatAmount(receivable.totalReceived)} />
          <Field label="Descontos/abatimentos" value={formatAmount(receivable.totalAdjustments)} />
          <Field label="Saldo restante" value={formatAmount(receivable.balance)} />
          <Field label="Situação" value={RECEIVABLE_STATUS_LABELS[receivable.status]} />
          <Field label="Vencimento" value={formatDate(receivable.dueDate)} />
          <Field label="Emissão" value={formatDate(receivable.issueDate)} />
          <Field label="Competência" value={formatDate(receivable.competencyDate)} />
        </div>
      </section>

      {/* Composição do valor (Parte 3B.1, item 10/11) — VISÃO agregada
          (saldo anterior em aberto da mesma origem + crédito disponível
          ainda não aplicado); nunca funde títulos nem altera o valor
          original (item 15). */}
      <section className="form-section">
        <h2>Composição do valor</h2>
        <table className="materias-table" style={{ maxWidth: "480px" }}>
          <tbody>
            {composition.lines.map((line, index) => (
              <tr key={index}>
                <td>{line.label}</td>
                <td style={{ textAlign: "right" }}>{line.amount < 0 ? "- " : ""}{formatAmount(Math.abs(line.amount))}</td>
              </tr>
            ))}
            <tr>
              <td><strong>TOTAL A PAGAR</strong></td>
              <td style={{ textAlign: "right" }}><strong>{formatAmount(composition.total)}</strong></td>
            </tr>
          </tbody>
        </table>
        {priorOpen.length > 0 ? (
          <p className="helper-text" style={{ marginTop: "8px" }}>
            Saldo anterior em aberto vem de {priorOpen.length} título(s) da mesma origem, ainda existentes individualmente (nunca fundidos): {priorOpen.map((item) => item.reference).join(", ")}.
          </p>
        ) : null}
        {creditAppliedToThis.length > 0 ? (
          <p className="helper-text">
            Já aplicado neste título: {formatAmount(creditAppliedToThis.reduce((sum, item) => sum + item.amount, 0))} de crédito de saldo anterior (ver histórico abaixo).
          </p>
        ) : null}
        {priorOpen.length > 0 ? (
          <div style={{ marginTop: "12px" }}>
            <CompositionPaymentPanel
              receivableIdsOldestFirst={[...priorOpen.map((item) => item.id), receivable.id]}
              totalDue={composition.total}
              staff={staff}
            />
          </div>
        ) : null}
      </section>

      <ReceivableCreditPanel
        receivableId={receivable.id}
        receivableBalance={receivable.balance}
        availableCredits={manuallyApplicableCredits}
      />

      <section className="form-section">
        <h2>Observações</h2>
        <p className="helper-text">{receivable.notes || "Nenhuma observação registrada."}</p>
      </section>

      <ReceivableActionsPanel receivable={receivable} receipts={receipts} adjustments={adjustments} staff={staff} hasOlderOpenBalance={priorOpen.length > 0} />
    </>
  );
}
