"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CommercialCondition, CommercialProduct, CommercialProposal, CommercialSale, CommercialSaleFinancialStatus, CommercialSaleStatus, NfseDraft } from "@ir/types";
import {
  COMMERCIAL_CHANNEL_LABELS,
  COMMERCIAL_CONDITIONS,
  COMMERCIAL_CONDITION_LABELS,
  COMMERCIAL_SALE_FINANCIAL_STATUS_LABELS,
  COMMERCIAL_SALE_STATUS_LABELS,
  COMMERCIAL_SALE_STATUS_TRANSITIONS,
  NFSE_DRAFT_STATUS_LABELS,
} from "@ir/types";
import type { ReceivableWithBalance } from "@ir/types";
import { RECEIVABLE_STATUS_LABELS } from "@ir/types";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import {
  cancelCommercialSaleAction,
  changeCommercialSaleStatusAction,
  createNfseDraftFromSaleAction,
  generateCommercialSaleFinanceiroAction,
  updateCommercialSaleAction,
  type GenerateFinanceiroResult,
} from "../../app/sistema/publicidade/vendas/[id]/actions";
import type { CommercialSaleFormInput } from "../../app/sistema/publicidade/vendas/commercialSaleFormTypes";
import { notify } from "../../lib/feedback/notify";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function toInput(sale: CommercialSale): CommercialSaleFormInput {
  return {
    clientId: sale.clientId,
    productId: sale.productId ?? "",
    channel: sale.channel,
    description: sale.description,
    startDate: sale.startDate,
    endDate: sale.endDate ?? "",
    amount: String(sale.amount),
    commercialCondition: sale.commercialCondition,
    installmentsCount: String(sale.installmentsCount),
    notes: sale.notes ?? "",
  };
}

export function CommercialSaleDetail({
  sale,
  clientName,
  products,
  receivables,
  financialStatus,
  nfseDraft,
  proposal,
}: {
  sale: CommercialSale;
  clientName: string;
  products: CommercialProduct[];
  receivables: ReceivableWithBalance[];
  financialStatus: CommercialSaleFinancialStatus;
  nfseDraft?: NfseDraft | null;
  proposal?: CommercialProposal | null;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState<CommercialSaleFormInput>(toInput(sale));
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [firstDueDate, setFirstDueDate] = useState(sale.startDate);
  const [generateResults, setGenerateResults] = useState<GenerateFinanceiroResult[] | null>(null);

  const financeiroGenerated = receivables.length > 0;
  const snapshotLocked = Boolean(sale.itemsSnapshot?.length);
  const remainingInstallments = Math.max(0,sale.installmentsCount -
    new Set(receivables.map(r=>r.installmentNumber).filter(n=>n!=null)).size);
  const nextStatuses = COMMERCIAL_SALE_STATUS_TRANSITIONS[sale.status];

  function set<K extends keyof CommercialSaleFormInput>(key: K, value: CommercialSaleFormInput[K]): void {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  function saveEdit(): void {
    startTransition(async () => {
      const result = await updateCommercialSaleAction(sale.id, input);
      if (result && "error" in result) {
        notify.error("Não foi possível salvar a venda", result.error);
        return;
      }
      setEditing(false);
      notify.success("Venda atualizada", "As alterações da venda foram salvas.");
      router.refresh();
    });
  }

  function handleChangeStatus(to: CommercialSaleStatus): void {
    startTransition(async () => {
      const result = await changeCommercialSaleStatusAction(sale.id, to);
      if (result && "error" in result) {
        notify.error("Não foi possível alterar o status", result.error);
        return;
      }
      notify.success("Status atualizado", "A venda agora está " + COMMERCIAL_SALE_STATUS_LABELS[to] + ".");
      router.refresh();
    });
  }

  function handleCancel(): void {
    setConfirmCancelOpen(false);
    startTransition(async () => {
      const result = await cancelCommercialSaleAction(sale.id);
      if (result && "error" in result) {
        notify.error("Não foi possível cancelar a venda", result.error);
        return;
      }
      notify.success("Venda cancelada", "A venda foi cancelada.");
      router.refresh();
    });
  }

  function handleGenerateFinanceiro(): void {
    setGenerateResults(null);
    startTransition(async () => {
      const result = await generateCommercialSaleFinanceiroAction(sale.id, firstDueDate);
      if ("error" in result) {
        notify.error("Não foi possível gerar o financeiro", result.error);
        return;
      }
      setGenerateResults(result.results);
      notify.success("Financeiro gerado", "Os títulos desta venda foram gerados.");
      router.refresh();
    });
  }

  function handleCreateNfseDraft(): void {
    startTransition(async () => {
      const result = await createNfseDraftFromSaleAction(sale.id);
      if ("error" in result) {
        notify.error("Não foi possível criar o rascunho de NFS-e", result.error);
        return;
      }
      router.push(`/sistema/nfse/rascunhos/${result.draftId}`);
    });
  }

  return (
    <div className="inline-form">

      <section className="form-section form-section--first">
        <h2>Dados comerciais</h2>
        {!editing ? (
          <>
            <div className="form-grid">
              <div className="form-field">
                <span className="field-label">Cliente</span>
                <span>{clientName}</span>
              </div>
              <div className="form-field">
                <span className="field-label">Publicidade</span>
                <span>{sale.channel} — {sale.description}</span>
                {sale.channel.trim().toLowerCase() === "website" ? (
                  <span className="helper-text">
                    Venda do canal site — esta tela não cria nem vincula o banner automaticamente.{" "}
                    <Link className="materia-title-link" href="/sistema/configuracoes/patrocinadores">
                      Configurar a posição/imagem em Publicidade
                    </Link>
                  </span>
                ) : null}
              </div>
              <div className="form-field">
                <span className="field-label">Período</span>
                <span>
                  {formatDate(sale.startDate)}
                  {sale.endDate ? ` a ${formatDate(sale.endDate)}` : " (sem data final)"}
                </span>
              </div>
              <div className="form-field">
                <span className="field-label">Valor</span>
                <span>{formatAmount(sale.amount)}</span>
              </div>
              <div className="form-field">
                <span className="field-label">Condição comercial</span>
                <span>{COMMERCIAL_CONDITION_LABELS[sale.commercialCondition]}{sale.commercialCondition === "installments" ? ` (${sale.installmentsCount}x)` : ""}</span>
              </div>
              <div className="form-field">
                <span className="field-label">Status</span>
                <span className="status-pill status-pill--scheduled">{COMMERCIAL_SALE_STATUS_LABELS[sale.status]}</span>
              </div>
              {proposal ? (
                <div className="form-field">
                  <span className="field-label">Origem</span>
                  <Link className="materia-title-link" href={`/sistema/publicidade/propostas/${proposal.id}`}>
                    Proposta {proposal.reference}
                  </Link>
                </div>
              ) : null}
            </div>
            <div className="form-actions" style={{ marginTop: "12px" }}>
              <button type="button" onClick={() => setEditing(true)} disabled={pending}>
                Editar
              </button>
              {nextStatuses
                .filter((status) => status !== "cancelled")
                .map((status) => (
                  <button key={status} type="button" onClick={() => handleChangeStatus(status)} disabled={pending}>
                    Marcar como {COMMERCIAL_SALE_STATUS_LABELS[status].toLowerCase()}
                  </button>
                ))}
            </div>
          </>
        ) : (
          <div className="form-grid">
            <label className="form-field">
              <span className="field-label">Produto/canal (catálogo) <span className="field-optional">(opcional)</span></span>
              <select value={input.productId} onChange={(event) => set("productId", event.target.value)} disabled={pending || snapshotLocked}>
                <option value="">— Nenhum —</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="field-label">Canal</span>
              <input type="text" value={input.channel} onChange={(event) => set("channel", event.target.value)} disabled={pending} />
            </label>
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Descrição</span>
              <input type="text" value={input.description} onChange={(event) => set("description", event.target.value)} disabled={pending} />
            </label>
            <label className="form-field">
              <span className="field-label">Data inicial</span>
              <input type="date" value={input.startDate} onChange={(event) => set("startDate", event.target.value)} disabled={pending || snapshotLocked} />
            </label>
            <label className="form-field">
              <span className="field-label">Data final <span className="field-optional">(opcional)</span></span>
              <input type="date" value={input.endDate} onChange={(event) => set("endDate", event.target.value)} disabled={pending || snapshotLocked} />
              {financeiroGenerated ? (
                <span className="helper-text">Período de veiculação — editar aqui não altera o vencimento dos títulos já gerados.</span>
              ) : null}
            </label>
            <label className="form-field">
              <span className="field-label">Valor{financeiroGenerated ? " (bloqueado — Financeiro já gerado)" : ""}</span>
              <input type="number" min="0" step="0.01" value={input.amount} onChange={(event) => set("amount", event.target.value)} disabled={pending || financeiroGenerated || snapshotLocked} />
            </label>
            <label className="form-field">
              <span className="field-label">Condição comercial{financeiroGenerated ? " (bloqueado — Financeiro já gerado)" : ""}</span>
              <select
                value={input.commercialCondition}
                onChange={(event) => set("commercialCondition", event.target.value as CommercialCondition)}
                disabled={pending || financeiroGenerated || snapshotLocked}
              >
                {COMMERCIAL_CONDITIONS.map((value) => (
                  <option key={value} value={value}>
                    {COMMERCIAL_CONDITION_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            {input.commercialCondition === "installments" ? (
              <label className="form-field">
                <span className="field-label">Número de parcelas{financeiroGenerated ? " (bloqueado — Financeiro já gerado)" : ""}</span>
                <input
                  type="number"
                  min="1"
                  value={input.installmentsCount}
                  onChange={(event) => set("installmentsCount", event.target.value)}
                  disabled={pending || financeiroGenerated || snapshotLocked}
                />
              </label>
            ) : null}
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Observações <span className="field-optional">(opcional)</span></span>
              <textarea rows={2} value={input.notes} onChange={(event) => set("notes", event.target.value)} disabled={pending} />
            </label>
            <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
              <button type="button" className="form-action-primary" onClick={saveEdit} disabled={pending}>
                {pending ? "Salvando…" : "Salvar"}
              </button>
              <button type="button" onClick={() => setEditing(false)} disabled={pending}>
                Cancelar edição
              </button>
            </div>
          </div>
        )}
      </section>

      {sale.itemsSnapshot?.length ? (
        <section className="form-section">
          <h2>Serviços desta contratação</h2>
          <p className="helper-text">
            Condições individuais preservadas da proposta original. Alterações posteriores no catálogo
            não mudam estes valores. As datas de execução de cada serviço deverão ser conferidas
            antes da emissão de um contrato jurídico.
          </p>
          <div className="materias-table-wrap">
            <table className="materias-table">
              <thead><tr>
                <th>Produto / modalidade</th><th>Descrição</th><th>Quantidade</th>
                <th>Unitário</th><th>Desconto</th><th>Total</th>
              </tr></thead>
              <tbody>
                {[...sale.itemsSnapshot].sort((a, b) => a.sortOrder - b.sortOrder).map((item) => (
                  <tr key={item.sourceProposalItemId}>
                    <td><strong>{item.productName}</strong><div className="helper-text">{COMMERCIAL_CHANNEL_LABELS[item.serviceChannel]}</div></td>
                    <td>{item.description}</td>
                    <td>{item.quantity}</td>
                    <td>{formatAmount(item.unitPrice)}</td>
                    <td>{formatAmount(item.discountAmount)}</td>
                    <td>{formatAmount(item.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="helper-text">
            Origem: {proposal ? <Link className="materia-title-link" href={`/sistema/publicidade/propostas/${proposal.id}`}>proposta {proposal.reference}</Link> : "proposta vinculada à venda"}.
            A geração de contrato e a assinatura ainda serão integradas numa próxima etapa.
          </p>
        </section>
      ) : null}

      <section className="form-section">
        <h2>Financeiro vinculado</h2>
        <p className="helper-text">
          Situação: <span className="status-pill status-pill--scheduled">{COMMERCIAL_SALE_FINANCIAL_STATUS_LABELS[financialStatus]}</span>
        </p>

        {receivables.length > 0 ? (
          <div className="materias-table-wrap">
            <table className="materias-table">
              <thead>
                <tr>
                  <th>Referência</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Saldo</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {receivables.map((receivable) => (
                  <tr key={receivable.id}>
                    <td>{receivable.reference}</td>
                    <td>{formatDate(receivable.dueDate)}</td>
                    <td>{formatAmount(receivable.originalAmount)}</td>
                    <td>{formatAmount(receivable.balance)}</td>
                    <td>{RECEIVABLE_STATUS_LABELS[receivable.status]}</td>
                    <td>
                      <Link className="secondary-link" href={`/sistema/financeiro/contas-a-receber/${receivable.id}`}>
                        Abrir Financeiro
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="helper-text">Nenhum título gerado ainda.</p>
        )}

        {sale.commercialCondition === "courtesy" ? (
          <p className="helper-text" style={{ marginTop: "12px" }}>
            Negociação em cortesia — sem cobrança, nenhum título a gerar.
          </p>
        ) : ["trade","bailment","other"].includes(sale.commercialCondition) ? (
          <p className="helper-text" role="status" style={{ marginTop: "12px" }}>
            Permuta, comodato ou condição especial: a geração automática de títulos está bloqueada.
            Registre e aprove separadamente a obrigação monetária e sua documentação antes de faturar.
            Caução de locação não equivale a receita recebida.
          </p>
        ) : remainingInstallments > 0 && ["approved","active","completed"].includes(sale.status) ? (
          <div style={{ marginTop: "12px" }}>
            <div className="form-grid">
              <label className="form-field">
                <span className="field-label">Primeiro vencimento</span>
                <input type="date" value={firstDueDate} onChange={(event) => setFirstDueDate(event.target.value)} disabled={pending} />
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="form-action-primary" onClick={handleGenerateFinanceiro} disabled={pending}>
                {pending ? "Gerando…" : `Gerar Financeiro (${remainingInstallments} parcela${remainingInstallments > 1 ? "s" : ""})`}
              </button>
            </div>
            {generateResults ? (
              <ul className="helper-text">
                {generateResults.map((result) => (
                  <li key={result.installmentNumber}>
                    Parcela {result.installmentNumber}: {result.alreadyGenerated ? "já existente, conferida sem duplicação" : result.ok ? "gerada com sucesso" : `não gerada — ${result.error}`}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="form-section">
        <h2>NFS-e</h2>
        <p className="helper-text">
          Independente do Financeiro — pode existir rascunho de NFS-e sem Financeiro gerado, Financeiro sem NFS-e, ou os dois.
        </p>
        {nfseDraft ? (
          <div className="form-actions">
            <span className="status-pill status-pill--draft">{NFSE_DRAFT_STATUS_LABELS[nfseDraft.status]}</span>
            <Link className="secondary-link" href={`/sistema/nfse/rascunhos/${nfseDraft.id}`}>
              Abrir NFS-e
            </Link>
          </div>
        ) : (
          <div className="form-actions">
            <button type="button" onClick={handleCreateNfseDraft} disabled={pending}>
              {pending ? "Criando…" : "Criar rascunho de NFS-e"}
            </button>
          </div>
        )}
      </section>

      {sale.notes ? (
        <section className="form-section">
          <h2>Observações</h2>
          <p>{sale.notes}</p>
        </section>
      ) : null}

      {sale.status !== "cancelled" ? (
        <section className="form-section">
          <div className="form-actions">
            <button type="button" className="form-action-danger" onClick={() => setConfirmCancelOpen(true)} disabled={pending}>
              Cancelar venda
            </button>
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmCancelOpen}
        title="Cancelar venda comercial?"
        description={
          <>
            <p>A venda passa para o status Cancelada. A venda em si nunca é apagada.</p>
            {financeiroGenerated ? (
              <p>
                <strong>Esta venda possui títulos financeiros vinculados.</strong> O cancelamento comercial não altera os lançamentos financeiros.
                Qualquer ajuste deverá ser realizado no módulo{" "}
                <Link href="/sistema/financeiro/contas-a-receber" className="materia-title-link">
                  Financeiro
                </Link>
                . ({receivables.filter((r) => r.status !== "cancelled").length} título(s) vinculado(s).)
              </p>
            ) : (
              <p>Esta venda ainda não tem Financeiro gerado.</p>
            )}
          </>
        }
        confirmLabel="Cancelar venda"
        onConfirm={handleCancel}
        onCancel={() => setConfirmCancelOpen(false)}
      />
    </div>
  );
}
