import Link from "next/link";
import { notFound } from "next/navigation";
import { ContractNotFoundError } from "@ir/core";
import {
  CONTRACT_STATUS_LABELS,
  clientDisplayName,
  computeContractBudgetFlag,
  computeContractVigencyFlag,
  computeEffectiveContractAmount,
  computeEffectiveContractEndsAt,
  computeReceivableDueFlag,
  buildContractTimeline,
} from "@ir/types";
import { ClientNotFoundError } from "@ir/core";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ReceivablesList } from "../../../../../features/financeiro/ReceivablesList";
import { ContractDocumentsPanel } from "../../../../../features/financeiro/ContractDocumentsPanel";
import { ContractAmendmentsPanel } from "../../../../../features/financeiro/ContractAmendmentsPanel";
import { ContractCommitmentOrdersPanel } from "../../../../../features/financeiro/ContractCommitmentOrdersPanel";
import { ContractInstallmentsPanel } from "../../../../../features/financeiro/ContractInstallmentsPanel";
import { ContractTimeline } from "../../../../../features/financeiro/ContractTimeline";
import { getContractService, getReceivableService, getClientCreditService } from "../../../../../composition/financeiro";
import { getClientService } from "../../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { sumCreditAppliedForReceivables } from "../../../../../providers/supabase/receivableRepository.supabase";

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

export default async function ContractDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const contractService = getContractService(supabase);
  const contract = await contractService.getById(params.id).catch((error: unknown) => {
    if (error instanceof ContractNotFoundError) return null;
    throw error;
  });
  if (!contract) notFound();

  const [client, documents, amendments, commitmentOrders, receivables, availableCredits] = await Promise.all([
    getClientService(supabase)
      .getById(contract.clientId)
      .catch((error: unknown) => {
        if (error instanceof ClientNotFoundError) return null;
        throw error;
      }),
    contractService.listDocuments(contract.id),
    contractService.listAmendments(contract.id),
    contractService.listCommitmentOrders(contract.id),
    getReceivableService(supabase).list({ contractId: contract.id }),
    getClientCreditService(supabase).list({ contractId: contract.id, availableOnly: true }),
  ]);
  const availableCreditTotal = availableCredits.reduce((sum, item) => sum + item.balance, 0);

  const receivableService = getReceivableService(supabase);
  const receiptsPerReceivable = await Promise.all(receivables.map((item) => receivableService.listReceipts(item.id)));
  const receiptsForTimeline = receiptsPerReceivable.flatMap((list, index) =>
    list.map((receipt) => ({ reference: receivables[index].reference, amount: receipt.amount, receivedAt: receipt.receivedAt })),
  );

  // Saldo CONTRATUAL (quanto ainda pode ser lançado dentro do valor
  // vigente) e saldo FINANCEIRO (quanto dos títulos já lançados ainda
  // não foi recebido) são conceitos DIFERENTES — Bloco 2, item 1.
  // Nunca misturados nesta tela.
  const amendmentsTotal = amendments.reduce((sum, item) => sum + item.amount, 0);
  const billedAmount = receivables.reduce((sum, item) => sum + item.originalAmount, 0);
  const receivedAmount = receivables.reduce((sum, item) => sum + item.totalReceived, 0);
  const adjustmentsAmount = receivables.reduce((sum, item) => sum + item.totalAdjustments, 0);
  const creditAppliedAmount = await sumCreditAppliedForReceivables(supabase, receivables.map((item) => item.id));
  const discountAmount = adjustmentsAmount - creditAppliedAmount;
  const financialBalance = billedAmount - receivedAmount - adjustmentsAmount;
  const effectiveAmount = computeEffectiveContractAmount(contract.contractedAmount, amendments);
  const effectiveEndsAt = computeEffectiveContractEndsAt(contract.endsAt, amendments);
  const contractualBalance = effectiveAmount !== undefined ? effectiveAmount - billedAmount : undefined;

  const vigencyFlag = computeContractVigencyFlag(effectiveEndsAt, contract.status);
  const budgetFlag = computeContractBudgetFlag(billedAmount, effectiveAmount);
  const overdueFinancialBalance = receivables
    .filter((item) => computeReceivableDueFlag(item.dueDate, item.status) === "overdue")
    .reduce((sum, item) => sum + item.balance, 0);

  const timeline = buildContractTimeline({
    startsAt: contract.startsAt,
    endsAt: effectiveEndsAt,
    status: contract.status,
    documents,
    amendments,
    commitmentOrders,
    receivables: receivables.map((item) => ({ reference: item.reference, issueDate: item.issueDate, originalAmount: item.originalAmount })),
    receipts: receiptsForTimeline,
  });

  return (
    <>
      <ModuleHeader
        eyebrow={`FINANCEIRO / CONTRATOS / ${contract.reference}`}
        title={client ? clientDisplayName(client) : "Contrato institucional"}
        description={contract.object || "Sem objeto informado"}
        action={
          <Link className="form-action-primary" href={`/sistema/financeiro/contratos/${contract.id}/editar`}>
            Editar
          </Link>
        }
      />

      {/* Alertas (Bloco 2, item 9) — sempre derivados, nunca gravados;
          sem jobs/background nesta fase, só exibição na própria tela. */}
      {vigencyFlag || budgetFlag || overdueFinancialBalance > 0 ? (
        <section className="form-section form-section--first">
          <h2>Alertas</h2>
          {vigencyFlag === "expired" ? (
            <p className="form-error" role="alert">Vigência encerrada em {formatDate(effectiveEndsAt)}.</p>
          ) : vigencyFlag === "expiring_soon" ? (
            <p className="form-error" role="alert">Vigência próxima do fim: {formatDate(effectiveEndsAt)}.</p>
          ) : null}
          {budgetFlag === "over_limit" ? (
            <p className="form-error" role="alert">
              Valor lançado ({formatAmount(billedAmount)}) ultrapassa o valor vigente ({formatAmount(effectiveAmount)}).
            </p>
          ) : budgetFlag === "near_limit" ? (
            <p className="form-error" role="alert">
              Valor lançado ({formatAmount(billedAmount)}) está próximo do valor vigente ({formatAmount(effectiveAmount)}).
            </p>
          ) : null}
          {overdueFinancialBalance > 0 ? (
            <p className="form-error" role="alert">Saldo financeiro vencido: {formatAmount(overdueFinancialBalance)}.</p>
          ) : null}
        </section>
      ) : null}

      <section className={vigencyFlag || budgetFlag || overdueFinancialBalance > 0 ? "form-section" : "form-section form-section--first"}>
        <h2>Dados do contrato</h2>
        <div className="form-grid">
          <div className="form-field">
            <span className="field-label">Cliente/órgão</span>
            <span>{client ? <Link className="materia-title-link" href={`/sistema/clientes/${client.id}`}>{clientDisplayName(client)}</Link> : "—"}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Número do contrato</span>
            <span>{contract.contractNumber || "—"}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Número do processo</span>
            <span>{contract.processNumber || "—"}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Modalidade</span>
            <span>{contract.modality || "—"}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Referência da licitação</span>
            <span>{contract.biddingReference || "—"}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Status</span>
            <span>{CONTRACT_STATUS_LABELS[contract.status]}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Vigência original</span>
            <span>{formatDate(contract.startsAt)} – {formatDate(contract.endsAt)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Vigência vigente {amendments.length > 0 ? "(com aditivos)" : ""}</span>
            <span>{formatDate(contract.startsAt)} – {formatDate(effectiveEndsAt)}</span>
          </div>
        </div>
      </section>

      {/* Resumo do contrato (Bloco 2, item 1) — saldo CONTRATUAL (quanto
          ainda pode ser lançado dentro do valor vigente) e saldo
          FINANCEIRO (quanto dos títulos já lançados ainda falta
          receber) são conceitos DIFERENTES, nunca misturados. */}
      <section className="form-section">
        <h2>Resumo do contrato</h2>
        <div className="form-grid">
          <div className="form-field">
            <span className="field-label">Valor original contratado</span>
            <span>{formatAmount(contract.contractedAmount)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Aditivos de valor {amendments.length > 0 ? `(${amendments.length})` : ""}</span>
            <span>{amendmentsTotal >= 0 ? "+" : ""}{formatAmount(amendmentsTotal)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Valor vigente</span>
            <span>{formatAmount(effectiveAmount)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Total lançado em títulos</span>
            <span>{formatAmount(billedAmount)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Saldo contratual não lançado</span>
            <span>{contractualBalance !== undefined ? formatAmount(contractualBalance) : "—"}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Total recebido</span>
            <span>{formatAmount(receivedAmount)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Descontos/abatimentos</span>
            <span>{formatAmount(discountAmount)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Créditos aplicados</span>
            <span>{formatAmount(creditAppliedAmount)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Saldo financeiro dos títulos</span>
            <span>{formatAmount(financialBalance)}</span>
          </div>
          {availableCreditTotal > 0 ? (
            <div className="form-field">
              <span className="field-label">Crédito disponível deste contrato</span>
              <span>{formatAmount(availableCreditTotal)}</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="form-section">
        <h2>Observações</h2>
        <p className="helper-text">{contract.notes || "Nenhuma observação registrada."}</p>
      </section>

      <ContractDocumentsPanel contractId={contract.id} documents={documents} />

      <ContractAmendmentsPanel contractId={contract.id} amendments={amendments} documents={documents} />

      <ContractCommitmentOrdersPanel contractId={contract.id} commitmentOrders={commitmentOrders} documents={documents} />

      <section className="form-section">
        <h2>Títulos deste contrato</h2>
        <div className="form-actions">
          <Link className="form-action-primary" href={`/sistema/financeiro/contas-a-receber/novo?clientId=${contract.clientId}&contractId=${contract.id}`}>
            Novo título para este contrato
          </Link>
        </div>
        <div style={{ marginTop: "12px" }}>
          <ContractInstallmentsPanel contract={contract} />
        </div>
        <div style={{ marginTop: "12px" }}>
          <ReceivablesList receivables={receivables.map((item) => ({ ...item, clientName: client ? clientDisplayName(client) : "—" }))} />
        </div>
      </section>

      <section className="form-section">
        <h2>Linha do tempo</h2>
        <ContractTimeline entries={timeline} />
      </section>
    </>
  );
}
