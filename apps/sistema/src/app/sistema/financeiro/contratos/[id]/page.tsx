import Link from "next/link";
import { notFound } from "next/navigation";
import { ContractNotFoundError } from "@ir/core";
import { CONTRACT_STATUS_LABELS, clientDisplayName } from "@ir/types";
import { ClientNotFoundError } from "@ir/core";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ReceivablesList } from "../../../../../features/financeiro/ReceivablesList";
import { ContractDocumentsPanel } from "../../../../../features/financeiro/ContractDocumentsPanel";
import { getContractService, getReceivableService } from "../../../../../composition/financeiro";
import { getClientService } from "../../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

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

  const [client, documents, receivables] = await Promise.all([
    getClientService(supabase)
      .getById(contract.clientId)
      .catch((error: unknown) => {
        if (error instanceof ClientNotFoundError) return null;
        throw error;
      }),
    contractService.listDocuments(contract.id),
    getReceivableService(supabase).list({ contractId: contract.id }),
  ]);

  const billedAmount = receivables.reduce((sum, item) => sum + item.originalAmount, 0);
  const receivedAmount = receivables.reduce((sum, item) => sum + item.totalReceived, 0);
  const adjustmentsAmount = receivables.reduce((sum, item) => sum + item.totalAdjustments, 0);

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

      <section className="form-section form-section--first">
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
            <span className="field-label">Vigência</span>
            <span>{formatDate(contract.startsAt)} – {formatDate(contract.endsAt)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Valor total contratado</span>
            <span>{formatAmount(contract.contractedAmount)}</span>
          </div>
        </div>
      </section>

      {/* Resumo financeiro (Parte 3A, item 14) — preparado, não totalmente
          apurado automaticamente: soma simples dos títulos já lançados
          para este contrato. Nada impede uma apuração mais completa depois. */}
      <section className="form-section">
        <h2>Resumo financeiro</h2>
        <div className="form-grid">
          <div className="form-field">
            <span className="field-label">Valor contratado</span>
            <span>{formatAmount(contract.contractedAmount)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Valor lançado/faturado</span>
            <span>{formatAmount(billedAmount)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Valor recebido</span>
            <span>{formatAmount(receivedAmount)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Descontos/abatimentos</span>
            <span>{formatAmount(adjustmentsAmount)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Saldo contratual</span>
            <span>{contract.contractedAmount !== undefined ? formatAmount(contract.contractedAmount - billedAmount) : "—"}</span>
          </div>
        </div>
      </section>

      <section className="form-section">
        <h2>Observações</h2>
        <p className="helper-text">{contract.notes || "Nenhuma observação registrada."}</p>
      </section>

      <ContractDocumentsPanel contractId={contract.id} documents={documents} />

      <section className="form-section">
        <h2>Títulos deste contrato</h2>
        <div className="form-actions">
          <Link className="form-action-primary" href={`/sistema/financeiro/contas-a-receber/novo?clientId=${contract.clientId}&contractId=${contract.id}`}>
            Novo título para este contrato
          </Link>
        </div>
        <div style={{ marginTop: "12px" }}>
          <ReceivablesList receivables={receivables.map((item) => ({ ...item, clientName: client ? clientDisplayName(client) : "—" }))} />
        </div>
      </section>
    </>
  );
}
