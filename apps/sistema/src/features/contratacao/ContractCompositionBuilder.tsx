"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  CHANNEL_LABELS,
  COMPOSITION_PERIODICITIES,
  PERIODICITY_LABELS,
  buildNumberedServiceClauses,
  checkTemplateForComposition,
  compositionTotals,
  computeServiceTotals,
  formatMoney,
  validateCompositionServices,
  type CompositionPeriodicity,
} from "../../lib/contracts/contractComposition";
import {
  CONTRACT_TEMPLATE_MODALITY_LABELS,
  contractTemplateStage,
  type CommercialProduct,
  type ContractTemplate,
  type ContractTemplateModality,
} from "@ir/types";
import { ClientPicker } from "../../components/admin/ClientPicker";
import type { ClientSearchResult } from "../../components/admin/clientSearchTypes";
import {
  createContractingFromCompositionAction,
  generateCompositionPdfAction,
  listContractorRepresentativesAction,
  type CompositionPdfResponse,
  type ContractingResponse,
} from "../../app/sistema/publicidade/contratacao/actions";
import type { ContractorRepresentativeOption } from "../../lib/contracts/contractorProfile";
import { confirmDialog } from "../../lib/feedback/confirmStore";
import { notify } from "../../lib/feedback/notify";
import { describeContractingPlan, manualVariables, newCatalogRow, newFreeRow, rowToInput, type ServiceRow } from "./compositionForm";

const STAGE_LABEL = { draft: "Rascunho", test: "TESTE", production: "PRODUÇÃO" } as const;

function base64ToBlobUrl(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

/**
 * Montagem de contratação (Etapa 2 de Contratos). Parte do cadastro único do
 * cliente, escolhe Comercial/Institucional e o modelo numa lista, reúne vários
 * serviços no mesmo documento com valor negociado por item (tabela e
 * justificativa preservadas) e gera a MINUTA com marca visível. Esta tela NÃO
 * assina, NÃO envia ao cliente, NÃO cobra e NÃO ativa modelos.
 */
export function ContractCompositionBuilder({
  templates,
  products,
  initialClient,
  canCommercial,
  canInstitutional,
  canCreateProposal,
  canNegotiate,
}: {
  templates: ContractTemplate[];
  products: CommercialProduct[];
  initialClient: ClientSearchResult | null;
  canCommercial: boolean;
  canInstitutional: boolean;
  canCreateProposal: boolean;
  /** Permissão específica `valores_negociar`: sem ela o valor negociado fica igual ao de tabela. */
  canNegotiate: boolean;
}): JSX.Element {
  const [pending, startTransition] = useTransition();
  const [client, setClient] = useState<ClientSearchResult | null>(initialClient);
  const [modality, setModality] = useState<ContractTemplateModality>(canCommercial ? "commercial" : "institutional");
  const [templateId, setTemplateId] = useState("");
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [catalogChoice, setCatalogChoice] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<(CompositionPdfResponse & { url: string }) | null>(null);
  // Identificador estável da contratação: clique duplo/repetição nunca cria cadastro duplicado (idempotência no servidor).
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [contracting, setContracting] = useState<Extract<ContractingResponse, { ok: true }> | null>(null);
  const [representatives, setRepresentatives] = useState<ContractorRepresentativeOption[]>([]);
  const [contractorConfigured, setContractorConfigured] = useState(true);
  const [representativeId, setRepresentativeId] = useState("");

  useEffect(() => {
    let active = true;
    void listContractorRepresentativesAction().then((response) => {
      if (!active || "error" in response) return;
      setRepresentatives(response.representatives);
      setContractorConfigured(response.configured);
    });
    return () => {
      active = false;
    };
  }, []);

  const modalityTemplates = useMemo(
    () => templates.filter((template) => template.modality === modality).sort((a, b) => a.title.localeCompare(b.title, "pt-BR")),
    [templates, modality],
  );
  const template = templates.find((item) => item.id === templateId);
  const templateCheck = template ? checkTemplateForComposition(template, modality) : null;

  const inputs = useMemo(() => rows.map(rowToInput), [rows]);
  const validation = useMemo(() => validateCompositionServices(inputs), [inputs]);
  const totals = useMemo(
    () => (validation.ok ? compositionTotals(validation.services) : null),
    [validation],
  );
  const clausesPreview = validation.ok ? buildNumberedServiceClauses(validation.services) : "";
  const allCatalog = rows.length > 0 && rows.every((row) => row.kind === "catalog");

  function updateRow(key: string, patch: Partial<ServiceRow>): void {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addCatalog(): void {
    const product = products.find((item) => item.id === catalogChoice);
    if (!product) return;
    setRows((current) => [...current, newCatalogRow(product)]);
    setCatalogChoice("");
  }

  function generate(): void {
    if (!client || !template || !validation.ok) return;
    setResult(null);
    startTransition(async () => {
      const response = await generateCompositionPdfAction({
        clientId: client.id,
        modality,
        templateId: template.id,
        representativeId: representativeId || undefined,
        services: validation.services,
        customValues,
      });
      if ("error" in response) {
        notify.error("Não foi possível gerar a minuta", response.error);
        return;
      }
      const url = base64ToBlobUrl(response.pdfBase64);
      setResult({ ...response, url });
      window.open(url, "_blank", "noopener,noreferrer");
      notify.success("Minuta gerada", `${response.marking}. Não foi gravada nem enviada ao cliente.`);
    });
  }

  function createContracting(): void {
    if (!client || !validation.ok) return;
    const plan = describeContractingPlan(modality, validation.services);
    startTransition(async () => {
      const confirmed = await confirmDialog({
        title: "Criar a contratação?",
        description:
          `Serão criados nos cadastros existentes:\n\n${plan.map((line) => `• ${line}`).join("\n")}\n\n` +
          "Nada será ativado, cobrado, assinado nem enviado ao cliente. Repetir esta ação não duplica os cadastros.",
        confirmLabel: "Criar contratação",
        destructive: false,
      });
      if (!confirmed) return;
      const response = await createContractingFromCompositionAction({
        requestId,
        clientId: client.id,
        modality,
        templateId: template?.id,
        representativeId: representativeId || undefined,
        services: validation.services,
      });
      if (!response.ok) {
        notify.error("Não foi possível criar a contratação", response.error);
        return;
      }
      setContracting(response);
      notify.success("Contratação criada", "Os cadastros foram criados sem ativação, cobrança ou assinatura.");
    });
  }

  const canGenerate = !!client && !!template && templateCheck?.ok === true && validation.ok && !pending;

  return (
    <>
      <section className="form-section form-section--first">
        <p className="helper-text" role="note">
          Esta tela monta a <strong>minuta</strong> para conferência: ela não assina, não envia ao cliente, não gera cobrança e não ativa
          nenhum modelo. Minutas de modelos em <strong>teste</strong> saem com a marca &quot;MINUTA DE TESTE — SEM EFEITO CONTRATUAL&quot;.
        </p>
        <h2>1. Cliente (cadastro único)</h2>
        <ClientPicker selected={client} onSelect={setClient} disabled={pending} />
        {client ? <p className="helper-text">{client.displayName} · {client.reference}</p> : null}

        <h2 style={{ marginTop: 20 }}>2. Modalidade e modelo</h2>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Modalidade</span>
            <select value={modality} onChange={(e) => { setModality(e.target.value as ContractTemplateModality); setTemplateId(""); setCustomValues({}); setResult(null); }}>
              {canCommercial ? <option value="commercial">{CONTRACT_TEMPLATE_MODALITY_LABELS.commercial}</option> : null}
              {canInstitutional ? <option value="institutional">{CONTRACT_TEMPLATE_MODALITY_LABELS.institutional}</option> : null}
            </select>
          </label>
          <label className="form-field">
            <span className="field-label">Modelo</span>
            <select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setCustomValues({}); setResult(null); }}>
              <option value="">Selecione na lista…</option>
              {modalityTemplates.map((item) => {
                const check = checkTemplateForComposition(item, modality);
                return (
                  <option key={item.id} value={item.id} disabled={!check.ok}>
                    {item.title} — v{item.version} — {STAGE_LABEL[contractTemplateStage(item)]}
                    {item.specificFor ? ` — ${item.specificFor}` : ""}
                    {check.ok ? "" : ` (indisponível: ${check.reason})`}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
        {modalityTemplates.length === 0 ? (
          <p className="helper-text">Nenhum modelo desta modalidade visível para você. Cadastre ou habilite para teste em Configurações → Modelos de contratos.</p>
        ) : null}
        <div className="form-grid" style={{ marginTop: 8 }}>
          <label className="form-field">
            <span className="field-label">Representante legal da contratada (quem assina)</span>
            <select value={representativeId} onChange={(e) => { setRepresentativeId(e.target.value); setResult(null); }}>
              <option value="">Padrão da empresa (válido na data)</option>
              {representatives.map((item) => (
                <option key={item.id} value={item.id} disabled={!item.validNow}>
                  {item.fullName} — {item.roleTitle}
                  {item.representationRule === "joint" ? " (assina em conjunto)" : ""}
                  {item.validNow ? (item.powersValidUntil ? ` — poderes até ${item.powersValidUntil.split("-").reverse().join("/")}` : "") : ` (indisponível: ${item.reason ?? "poderes fora da vigência"})`}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!contractorConfigured ? (
          <p className="helper-text" role="status">Dados da empresa ainda não cadastrados em Configurações → Dados da empresa: o cabeçalho da contratada sairá com pendência.</p>
        ) : null}
        {templateCheck?.ok ? (
          <p className="helper-text" role="status">
            {templateCheck.stage === "test"
              ? "Modelo em TESTE: a minuta sai marcada como \"MINUTA DE TESTE — SEM EFEITO CONTRATUAL\"."
              : "Modelo em PRODUÇÃO: a minuta sai marcada \"PARA CONFERÊNCIA — NÃO ASSINAR\" (não é a emissão oficial)."}
          </p>
        ) : null}
        {template && manualVariables(template).length > 0 ? (
          <div className="form-grid" style={{ marginTop: 8 }}>
            {manualVariables(template).map((variable) => (
              <label className="form-field" key={variable.key}>
                <span className="field-label">{variable.label}{variable.required ? " *" : ""}</span>
                <input value={customValues[variable.key] ?? ""} onChange={(e) => setCustomValues({ ...customValues, [variable.key]: e.target.value })} />
              </label>
            ))}
          </div>
        ) : null}
      </section>

      <section className="form-section">
        <h2>3. Serviços do documento</h2>
        <p className="helper-text">
          Vários serviços no mesmo documento (publicidade, painel LED, assinatura do jornal…). Cada um vira uma cláusula (2.1, 2.2…) com valor e vigência próprios.
          O valor de tabela fica preservado; ao negociar, informe a justificativa.
        </p>
        <div className="form-actions">
          <select value={catalogChoice} onChange={(e) => setCatalogChoice(e.target.value)} aria-label="Produto do catálogo">
            <option value="">Produto do catálogo…</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} — {CHANNEL_LABELS[product.channel] ?? product.channel}
                {product.suggestedPrice !== undefined ? ` — tabela ${formatMoney(product.suggestedPrice)}` : ""}
              </option>
            ))}
          </select>
          <button type="button" disabled={!catalogChoice || pending} onClick={addCatalog}>+ Adicionar produto</button>
          <button type="button" disabled={pending} onClick={() => setRows((current) => [...current, newFreeRow("subscription")])}>+ Assinatura do jornal</button>
          <button type="button" disabled={pending} onClick={() => setRows((current) => [...current, newFreeRow("other")])}>+ Outro serviço</button>
        </div>

        {rows.length === 0 ? <p className="helper-text" style={{ marginTop: 12 }}>Nenhum serviço adicionado.</p> : (
          <ul className="destaques-list" style={{ marginTop: 12 }}>
            {rows.map((row, index) => {
              const input = inputs[index];
              const rowTotals = Number.isFinite(input.quantity) && Number.isFinite(input.listUnitPrice) && Number.isFinite(input.negotiatedUnitPrice)
                ? computeServiceTotals(input) : null;
              return (
                <li className="destaques-item" key={row.key} style={{ display: "block" }}>
                  <div className="form-actions" style={{ justifyContent: "space-between" }}>
                    <strong>2.{index + 1} — {row.kind === "catalog" ? "Produto do catálogo" : row.kind === "subscription" ? "Assinatura do jornal" : "Outro serviço"}</strong>
                    <button type="button" disabled={pending} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>Remover serviço</button>
                  </div>
                  <div className="form-grid">
                    <label className="form-field">
                      <span className="field-label">Título</span>
                      <input value={row.title} onChange={(e) => updateRow(row.key, { title: e.target.value })} maxLength={160} />
                    </label>
                    <label className="form-field">
                      <span className="field-label">Quantidade</span>
                      <input value={row.quantity} onChange={(e) => updateRow(row.key, { quantity: e.target.value })} inputMode="decimal" />
                    </label>
                    <label className="form-field">
                      <span className="field-label">Valor unitário de tabela (R$){row.kind === "catalog" ? " — do catálogo" : ""}</span>
                      <input value={row.listUnitPrice} readOnly={row.kind === "catalog" && row.listUnitPrice !== ""} inputMode="decimal"
                        onChange={(e) => updateRow(row.key, { listUnitPrice: e.target.value, ...(row.kind !== "catalog" && row.negotiatedUnitPrice === row.listUnitPrice ? { negotiatedUnitPrice: e.target.value } : {}) })} />
                    </label>
                    <label className="form-field">
                      <span className="field-label">Valor unitário negociado (R$){canNegotiate ? " — pode ser menor ou maior que a tabela" : " — sem permissão para negociar"}</span>
                      <input value={row.negotiatedUnitPrice} inputMode="decimal" readOnly={!canNegotiate && row.kind === "catalog"}
                        onChange={(e) => updateRow(row.key, { negotiatedUnitPrice: e.target.value })} />
                    </label>
                    {rowTotals?.isNegotiated ? (
                      <label className="form-field" style={{ gridColumn: "1 / -1" }}>
                        <span className="field-label">
                          Justificativa do valor negociado (obrigatória) — {rowTotals.adjustmentAmount >= 0 ? "desconto" : "acréscimo"} de {formatMoney(Math.abs(rowTotals.adjustmentAmount))} ({Math.abs(rowTotals.adjustmentPercent).toLocaleString("pt-BR")}%)
                        </span>
                        <input value={row.negotiationReason} onChange={(e) => updateRow(row.key, { negotiationReason: e.target.value })} />
                      </label>
                    ) : null}
                    <label className="form-field">
                      <span className="field-label">Início da vigência</span>
                      <input type="date" value={row.startsOn} onChange={(e) => updateRow(row.key, { startsOn: e.target.value })} />
                    </label>
                    <label className="form-field">
                      <span className="field-label">Término da vigência</span>
                      <input type="date" value={row.endsOn} onChange={(e) => updateRow(row.key, { endsOn: e.target.value })} />
                    </label>
                    <label className="form-field">
                      <span className="field-label">Periodicidade</span>
                      <select value={row.periodicity} onChange={(e) => updateRow(row.key, { periodicity: e.target.value as CompositionPeriodicity })}>
                        {COMPOSITION_PERIODICITIES.map((value) => <option key={value} value={value}>{PERIODICITY_LABELS[value]}</option>)}
                      </select>
                    </label>
                    {row.kind === "subscription" ? (
                      <>
                        <label className="form-field">
                          <span className="field-label">Tipo de assinatura</span>
                          <select value={row.subscriptionServiceType} onChange={(e) => updateRow(row.key, { subscriptionServiceType: e.target.value as "impresso" | "digital" })}>
                            <option value="impresso">Impressa</option>
                            <option value="digital">Digital</option>
                          </select>
                        </label>
                        {row.subscriptionServiceType === "impresso" ? (
                          <label className="form-field">
                            <span className="field-label">Exemplares</span>
                            <input value={row.copies} inputMode="numeric" onChange={(e) => updateRow(row.key, { copies: e.target.value })} />
                          </label>
                        ) : null}
                      </>
                    ) : null}
                    <label className="form-field" style={{ gridColumn: "1 / -1" }}>
                      <span className="field-label">Descrição / objeto</span>
                      <input value={row.description} onChange={(e) => updateRow(row.key, { description: e.target.value })} maxLength={1000} />
                    </label>
                    <label className="form-field">
                      <span className="field-label">Entrega / veiculação</span>
                      <input value={row.deliveryNote} onChange={(e) => updateRow(row.key, { deliveryNote: e.target.value })} maxLength={500} />
                    </label>
                    <label className="form-field">
                      <span className="field-label">Renovação</span>
                      <input value={row.renewalNote} onChange={(e) => updateRow(row.key, { renewalNote: e.target.value })} maxLength={500} />
                    </label>
                    <label className="form-field">
                      <span className="field-label">Encerramento</span>
                      <input value={row.terminationNote} onChange={(e) => updateRow(row.key, { terminationNote: e.target.value })} maxLength={500} />
                    </label>
                  </div>
                  {rowTotals ? <p className="helper-text">Total deste serviço: <strong>{formatMoney(rowTotals.negotiatedTotal)}</strong>{rowTotals.isNegotiated ? ` (tabela ${formatMoney(rowTotals.listTotal)})` : ""}</p> : null}
                </li>
              );
            })}
          </ul>
        )}

        {rows.length > 0 && !validation.ok ? (
          <ul className="field-error" role="alert" style={{ marginTop: 8 }}>
            {validation.errors.map((message) => <li key={message}>{message}</li>)}
          </ul>
        ) : null}
        {totals ? (
          <p className="helper-text" style={{ marginTop: 8 }}>
            Total de tabela {formatMoney(totals.listTotal)} · Total negociado <strong>{formatMoney(totals.negotiatedTotal)}</strong>
            {totals.adjustmentAmount !== 0 ? ` · ${totals.adjustmentAmount > 0 ? "desconto" : "acréscimo"} total ${formatMoney(Math.abs(totals.adjustmentAmount))}` : ""}
          </p>
        ) : null}
      </section>

      {clausesPreview ? (
        <section className="form-section">
          <h2>4. Prévia das cláusulas de serviços</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, lineHeight: 1.5 }}>{clausesPreview}</pre>
        </section>
      ) : null}

      <section className="form-section">
        <h2>5. Gerar</h2>
        <div className="form-actions">
          <button type="button" className="form-action-primary" disabled={!canGenerate} onClick={generate}>
            {pending ? "Processando…" : "Gerar minuta em PDF"}
          </button>
          <button type="button" disabled={!client || !validation.ok || pending || contracting !== null} onClick={createContracting}
            title={modality === "commercial" && !canCreateProposal ? "O servidor confere as permissões de cada cadastro (proposta, assinatura)" : undefined}>
            Criar contratação (cadastros)
          </button>
          {modality === "institutional" && client ? (
            <Link className="secondary-link" href={`/sistema/financeiro/contratos/novo?clientId=${client.id}`}>Abrir contrato institucional do cliente</Link>
          ) : null}
        </div>
        {!canGenerate ? (
          <p className="helper-text">
            {!client ? "Selecione o cliente. " : ""}{!template ? "Selecione o modelo. " : templateCheck && !templateCheck.ok ? `${templateCheck.reason} ` : ""}{!validation.ok && rows.length > 0 ? "Corrija os serviços. " : rows.length === 0 ? "Adicione ao menos um serviço." : ""}
          </p>
        ) : null}
        {contracting ? (
          <div role="status" style={{ marginTop: 12 }}>
            {contracting.proposal ? (
              <p className="helper-text">
                Proposta <Link href={`/sistema/publicidade/propostas/${contracting.proposal.id}`}>{contracting.proposal.reference}</Link>{" "}
                {contracting.proposal.created ? "criada" : "já existia (não duplicada)"}. O próximo passo (aprovação, venda e pacote) segue o fluxo comercial existente.
              </p>
            ) : null}
            {contracting.subscriptions.map((item) => (
              <p className="helper-text" key={item.id}>
                Assinatura <Link href={`/sistema/assinaturas/${item.id}`}>{item.reference}</Link> {item.created ? "criada" : "já existia (não duplicada)"} — pendente de formalização (sem ativação e sem cobrança).
              </p>
            ))}
            {contracting.contract ? (
              <p className="helper-text">
                Contrato institucional <Link href={`/sistema/financeiro/contratos/${contracting.contract.id}`}>{contracting.contract.reference}</Link>{" "}
                {contracting.contract.created ? "criado" : "já existia (não duplicado)"}. Nenhum documento, cobrança ou assinatura foi gerado.
              </p>
            ) : null}
            {contracting.notices.map((notice) => <p className="helper-text" key={notice}>{notice}</p>)}
            <div className="form-actions">
              <button type="button" onClick={() => { setContracting(null); setRequestId(crypto.randomUUID()); setRows([]); }}>Nova contratação</button>
            </div>
          </div>
        ) : null}
        {result ? (
          <div role="status" style={{ marginTop: 12 }}>
            <p className="helper-text"><strong>{result.marking}</strong> — minuta aberta em nova aba (não foi gravada nem enviada). <a href={result.url} download={result.fileName}>Baixar PDF</a></p>
            {!result.contractorConfigured ? <p className="field-error">Dados da empresa (contratada) não cadastrados: o cabeçalho saiu com pendência. Cadastre em Configurações → Dados da empresa.</p> : null}
            {result.pendencies.length > 0 ? <p className="field-error">Pendências no documento: {result.pendencies.join("; ")}.</p> : <p className="helper-text">Sem pendências de campos.</p>}
            {result.notices.map((notice) => <p className="helper-text" key={notice}>{notice}</p>)}
          </div>
        ) : null}
      </section>
    </>
  );
}
