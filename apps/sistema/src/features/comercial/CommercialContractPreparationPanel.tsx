"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  prepareCommercialContractAction,
  saveCommercialContractTemplateAction,
  previewCommercialContractAction,
  reviewCommercialContractAction,
  setCommercialContractModeAction,
  updateCommercialContractTermsAction,
} from "../../app/sistema/publicidade/vendas/[id]/contract-actions";
import {
  approveCommercialLegalReviewAction, issueCommercialContractDocumentsAction,
  reopenCommercialLegalReviewAction,
} from "../../app/sistema/publicidade/vendas/[id]/commercial-issuance-actions";

export interface CommercialContractServiceView {
  id: string;
  item_ordinal: number;
  source_snapshot: Record<string, unknown>;
  service_channel: string;
  service_title: string;
  starts_on: string | null;
  ends_on: string | null;
  service_location: string | null;
  service_scope: string | null;
  execution_conditions: string | null;
}
export interface CommercialContractPackageView {
  id: string;
  document_mode: "combined" | "separate";
  status: "draft" | "pending_legal_review" | "legal_approved";
  services: CommercialContractServiceView[];
}

interface CommercialReviewEventView {
  id: string;
  event_type: "approved" | "reopened";
  note: string;
  occurred_at: string;
}
interface CommercialIssuedDocumentView {
  id: string;
  service_id: string | null;
  title: string;
  template_version: number;
  sha256: string;
  issued_at: string;
}
interface CommercialTemplateOption {
  id: string;
  title: string;
  category: string;
  version: number;
  variables: { key: string; label: string; required: boolean }[];
}
interface CommercialTemplateBinding {
  serviceId: string | null;
  templateId: string;
  values: Record<string,string>;
}
const AUTO_FIELDS = new Set([
  "cliente.nome", "cliente.documento", "cliente.endereco",
  "cliente.representante", "cliente.representante_cpf", "cliente.qualificacao",
  "venda.referencia", "venda.valor", "servicos.resumo",
]);
function TemplateChoice({
  heading, options, selected, initialValues, disabled, onSave,
}: {
  heading: string; options: CommercialTemplateOption[]; selected: string;
  initialValues: Record<string,string>; disabled: boolean;
  onSave: (id: string | null, values: Record<string,string>) => void;
}): JSX.Element {
  const [choice, setChoice] = useState(selected);
  const [values, setValues] = useState<Record<string,string>>({...initialValues});
  const template = options.find(o => o.id === choice);
  const variables = template?.variables.filter(v => !AUTO_FIELDS.has(v.key)) ?? [];
  const same = choice === selected && JSON.stringify(values) === JSON.stringify(initialValues);
  return (
    <div className="inline-form">
      <div className="form-grid">
        <label className="form-field">
          <span className="field-label">{heading}</span>
          <select value={choice} disabled={disabled} onChange={(e) => {
            setChoice(e.target.value);
            setValues(e.target.value === selected ? {...initialValues} : {});
          }}>
            <option value="">Nenhum modelo selecionado</option>
            {options.map(t => <option key={t.id} value={t.id}>
              {t.title} · v{t.version}
            </option>)}
          </select>
        </label>
        <div className="form-field">
          <span className="field-label">Modelo jurídico e variáveis</span>
          <button type="button" disabled={disabled || same}
            onClick={() => onSave(choice || null, values)}>Salvar modelo e campos</button>
        </div>
      </div>
      {variables.map(variable => (
        <label className="form-field" key={variable.key}>
          <span className="field-label">{variable.label}{variable.required ? " (obrigatório para gerar PDF)" : ""}</span>
          <input type="text" maxLength={2000} disabled={disabled} value={values[variable.key] ?? ""}
            onChange={(e) => setValues(old => ({...old, [variable.key]: e.target.value}))}/>
        </label>
      ))}
      {options.length === 0 ? (
        <p className="helper-text">Não há modelos ativos da categoria correspondente.
          Cadastre um modelo versionado na área de Modelos de contrato antes de gerar o PDF.</p>
      ) : null}
    </div>
  );
}

const modeNames = {
  combined: "Contrato único com todos os serviços",
  separate: "Documentos separados por serviço",
};
function currency(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Valor não registrado";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CommercialContractPreparationPanel({
  saleId, clientId, saleStatus, defaultMode, pkg, canPrepare, canReview, templateOptions, templateAssignments, issuedDocuments, reviewEvents, loadError,
}: {
  saleId: string;
  clientId: string;
  saleStatus: string;
  defaultMode: "combined" | "separate";
  pkg: CommercialContractPackageView | null;
  canPrepare: boolean;
  canReview: boolean;
  templateOptions: CommercialTemplateOption[];
  templateAssignments: CommercialTemplateBinding[];
  issuedDocuments: CommercialIssuedDocumentView[];
  reviewEvents: CommercialReviewEventView[];
  loadError?: string;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"combined" | "separate">(pkg?.document_mode ?? defaultMode);
  const [preview, setPreview] = useState<{ documents: { title: string; text: string }[]; missing: string[] } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [legalChecked, setLegalChecked] = useState(false);
  const [legalNote, setLegalNote] = useState("");
  const [reopenNote, setReopenNote] = useState("");

  async function showPreview(): Promise<void> {
    if (!pkg || previewBusy) return;
    setPreviewBusy(true); setError(""); setNotice(""); setPreview(null);
    try {
      const result = await previewCommercialContractAction(pkg.id, saleId);
      if ("error" in result) setError(result.error);
      else setPreview(result.preview);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível montar a prévia.");
    } finally { setPreviewBusy(false); }
  }


  function submit(action: Promise<{ error: string } | { ok: true; packageId: string }>, message: string): void {
    startTransition(async () => {
      setError(""); setNotice("");
      try {
        const result = await action;
        if ("error" in result) { setError(result.error); return; }
        setNotice(message);
        setPreview(null); // conteúdo mudou; não exibir minuta desatualizada
        router.refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Não foi possível concluir a operação.");
      }
    });
  }

  return (
    <section className="form-section" aria-labelledby="contratacao-servicos">
      <h2 id="contratacao-servicos">Contratação dos serviços</h2>
      <p className="helper-text">
        O modelo é selecionado automaticamente pelo tipo de serviço quando a contratação é preparada.
        Você só precisa conferir as condições; se não houver uma opção inequívoca, o sistema pedirá uma escolha.
        Os preços e os itens são recuperados da venda original. Confira datas, modalidades e condições de
        cada serviço antes de encaminhar à revisão jurídica. A emissão definitiva é uma ação posterior,
        exclusiva de revisor autorizado após confirmação jurídica. Nenhuma etapa gera cobrança
        ou solicita assinatura automaticamente.
      </p>
      <p className="helper-text">
        A qualificação jurídica é recuperada do cadastro único, sem redigitação.
        {" "}<a href={"/sistema/clientes/" + clientId + "/editar"}>
          Conferir CPF/CNPJ, razão social, representante e endereço do cliente
        </a>.
      </p>
      {loadError ? <p role="alert" className="form-error">{loadError}</p> : null}
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      {notice ? <p role="status" className="helper-text">{notice}</p> : null}
      {!pkg ? (
        <>
          {["approved", "active"].includes(saleStatus) ? (
            canPrepare && !loadError ? (
              <div className="inline-form">
                <label className="form-field">
                  <span className="field-label">Como serão organizados os documentos?</span>
                  <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
                    <option value="combined">{modeNames.combined}</option>
                    <option value="separate">{modeNames.separate}</option>
                  </select>
                </label>
                <div className="form-actions">
                  <button type="button" disabled={pending} onClick={() =>
                    submit(prepareCommercialContractAction(saleId, mode), "Rascunho preparado com os itens originais da venda.")
                  }>Preparar contratação</button>
                </div>
              </div>
            ) : <p className="helper-text">A preparação exige permissão específica no módulo Comercial.</p>
          ) : <p className="helper-text">Aprovação da venda obrigatória para preparar o contrato.</p>}
        </>
      ) : (
        <div className="inline-form">
          <p>
            <strong>{pkg.status === "draft" ? "Rascunho em preparação" : pkg.status === "legal_approved" ? "Conferência jurídica aprovada" : "Aguardando revisão jurídica"}</strong>
            {" · "}
            {modeNames[pkg.document_mode]}
          </p>
          {pkg.status === "draft" && canPrepare ? (
            <div className="form-grid">
              <label className="form-field">
                <span className="field-label">Forma de documentação</span>
                <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
                  <option value="combined">{modeNames.combined}</option>
                  <option value="separate">{modeNames.separate}</option>
                </select>
              </label>
              <div className="form-field">
                <span className="field-label">Agrupamento</span>
                <button type="button" disabled={pending || mode === pkg.document_mode} onClick={() =>
                  submit(setCommercialContractModeAction(pkg.id, saleId, mode), "Forma de documentação atualizada.")
                }>Salvar escolha</button>
              </div>
            </div>
          ) : null}
          {pkg.document_mode === "combined" ? (
            <TemplateChoice
              key={"combined-" + (templateAssignments.find(b => b.serviceId === null)?.templateId ?? "")}
              heading="Modelo jurídico do contrato único"
              options={templateOptions.filter(t => t.category.toLowerCase() === "commercial_combined")}
              selected={templateAssignments.find(b => b.serviceId === null)?.templateId ?? ""}
              initialValues={templateAssignments.find(b => b.serviceId === null)?.values ?? {}}
              disabled={!canPrepare || pkg.status !== "draft" || pending}
              onSave={(templateId, values) => submit(
                saveCommercialContractTemplateAction(pkg.id, saleId, null, templateId, values),
                "Modelo vinculado à contratação para revisão.",
              )}
            />
          ) : null}
          {pkg.document_mode === "combined" &&
            templateAssignments.some(binding => binding.serviceId === null) ? (
              <p className="helper-text">
                <a href={"/sistema/publicidade/vendas/" + saleId + "/conferencia-pdf"}>
                  Baixar minuta PDF para conferência (não assinável)
                </a>
              </p>
          ) : null}
          {pkg.services.map((service) => {
            const snapshot = service.source_snapshot;
            const price = snapshot.totalAmount;
            const needsLocation = ["led_panel", "equipment_rental"].includes(service.service_channel);
            return (
              <form
                key={service.id}
                className="form-section"
                onSubmit={(event) => {
                  event.preventDefault();
                  const fd = new FormData(event.currentTarget);
                  submit(updateCommercialContractTermsAction(pkg.id, saleId, {
                    serviceId: service.id,
                    startsOn: String(fd.get("startsOn") || ""),
                    endsOn: String(fd.get("endsOn") || ""),
                    location: String(fd.get("location") || ""),
                    scope: String(fd.get("scope") || ""),
                    executionConditions: String(fd.get("conditions") || ""),
                  }), "Condições do serviço salvas.");
                }}
              >
                <h3>{service.item_ordinal + 1}. {service.service_title}</h3>
                <p className="helper-text">
                  Modalidade: {service.service_channel} · {currency(price)}
                  {" · "}Quantidade: {typeof snapshot.quantity === "number" ? snapshot.quantity : "a conferir"}
                </p>
                {pkg.document_mode === "separate" ? (
                  <TemplateChoice
                    key={service.id + "-" + (templateAssignments.find(b => b.serviceId === service.id)?.templateId ?? "")}
                    heading="Modelo jurídico para este serviço"
                    options={templateOptions.filter(t =>
                      ["commercial_generic", "commercial_" + service.service_channel.toLowerCase()].includes(t.category.toLowerCase())
                    )}
                    selected={templateAssignments.find(b => b.serviceId === service.id)?.templateId ?? ""}
                    initialValues={templateAssignments.find(b => b.serviceId === service.id)?.values ?? {}}
                    disabled={!canPrepare || pkg.status !== "draft" || pending}
                    onSave={(templateId, values) => submit(
                      saveCommercialContractTemplateAction(pkg.id, saleId, service.id, templateId, values),
                      "Modelo individual vinculado à contratação.",
                    )}
                  />
                ) : null}
                <div className="form-grid">
                  <label className="form-field"><span className="field-label">Início do serviço</span>
                    <input type="date" name="startsOn" defaultValue={service.starts_on ?? ""} disabled={!canPrepare || pkg.status !== "draft"}/>
                  </label>
                  <label className="form-field"><span className="field-label">Fim do serviço</span>
                    <input type="date" name="endsOn" defaultValue={service.ends_on ?? ""} disabled={!canPrepare || pkg.status !== "draft"}/>
                  </label>
                  <label className="form-field"><span className="field-label">
                    Local de prestação {needsLocation ? "(obrigatório)" : "(se aplicável)"}
                  </span>
                    <input type="text" name="location" maxLength={500} defaultValue={service.service_location ?? ""}
                      disabled={!canPrepare || pkg.status !== "draft"} />
                  </label>
                </div>
                <label className="form-field"><span className="field-label">Objeto e entregas deste serviço</span>
                  <textarea name="scope" rows={3} maxLength={4000} defaultValue={service.service_scope ?? ""}
                    disabled={!canPrepare || pkg.status !== "draft"} />
                </label>
                <label className="form-field"><span className="field-label">Condições adicionais aprovadas</span>
                  <textarea name="conditions" rows={2} maxLength={4000} defaultValue={service.execution_conditions ?? ""}
                    disabled={!canPrepare || pkg.status !== "draft"} />
                </label>
                {pkg.document_mode === "separate" &&
                  templateAssignments.some(binding => binding.serviceId === service.id) ? (
                    <p className="helper-text">
                      <a href={"/sistema/publicidade/vendas/" + saleId
                          + "/conferencia-pdf?service=" + encodeURIComponent(service.id)}>
                        Baixar minuta PDF individual (não assinável)
                      </a>
                    </p>
                ) : null}
                {pkg.status === "draft" && canPrepare ? (
                  <div className="form-actions">
                    <button type="submit" disabled={pending}>Salvar serviço</button>
                  </div>
                ) : null}
              </form>
            );
          })}
          {canReview ? (
            <div className="form-actions">
              {pkg.status === "draft" ? (
                <button type="button" disabled={pending} onClick={() =>
                  submit(reviewCommercialContractAction(pkg.id, saleId, "pending_legal_review"), "Encaminhado para revisão jurídica.")
                }>Encaminhar para revisão jurídica</button>
              ) : pkg.status === "pending_legal_review" ? (
                <button type="button" disabled={pending} onClick={() =>
                  submit(reviewCommercialContractAction(pkg.id, saleId, "draft"), "Devolvido para ajustes.")
                }>Devolver para ajustes</button>
              ) : null}
            </div>
          ) : null}
          {pkg.status === "pending_legal_review" && canReview ? (
            <div className="form-section">
              <h3>Confirmação jurídica por revisor</h3>
              <p className="helper-text">
                Confira o conteúdo completo de todos os modelos, a qualificação das partes,
                os prazos, valores, cláusulas e obrigações. Esta decisão ficará registrada e
                bloqueará edições posteriores; aprovação automática não é permitida.
              </p>
              <label className="form-field">
                <span className="field-label">Registro da conferência jurídica</span>
                <textarea rows={3} maxLength={1000} value={legalNote}
                  disabled={pending} onChange={event=>setLegalNote(event.target.value)}
                  placeholder="Identifique a conferência realizada e os documentos analisados..." />
              </label>
              <label className="form-field">
                <input type="checkbox" checked={legalChecked} disabled={pending}
                  onChange={event=>setLegalChecked(event.target.checked)} />
                {" "}Confirmo pessoalmente que revisei e aprovei os modelos e condições para emissão.
              </label>
              <div className="form-actions">
                <button type="button"
                  disabled={pending || !legalChecked || legalNote.trim().length < 20}
                  onClick={()=>submit(approveCommercialLegalReviewAction(
                    pkg.id,saleId,legalChecked,legalNote
                  ),"Conferência jurídica registrada. Documentos prontos para emissão controlada.")}>
                  Registrar aprovação jurídica
                </button>
              </div>
            </div>
          ) : null}
          {pkg.status === "legal_approved" && canReview ? (
            <div className="form-section">
              <h3>Emissão dos PDFs comerciais</h3>
              <p className="helper-text">
                Gera arquivos privados e imutáveis, vinculados a esta venda. Documentos
                já registrados não são substituídos. Emissão não é assinatura e não cria cobranças.
              </p>
              <button type="button" disabled={pending}
                onClick={()=>submit(issueCommercialContractDocumentsAction(pkg.id,saleId),
                  "Emissão processada. Confira os documentos registrados abaixo.")}>
                Emitir documentos aprovados
              </button>
            </div>
          ) : null}
          {pkg.status === "legal_approved" && canReview && issuedDocuments.length === 0 ? (
            <div className="form-section">
              <h3>Correção antes da emissão</h3>
              <p className="helper-text">
                Se um modelo ou condição precisar de ajuste, reabra o rascunho
                justificando a decisão. Após qualquer PDF emitido, a aprovação
                fica bloqueada para alterações e será necessário aditivo.
              </p>
              <label className="form-field">
                <span className="field-label">Justificativa da reabertura</span>
                <textarea rows={2} maxLength={1000} value={reopenNote}
                  disabled={pending} onChange={event=>setReopenNote(event.target.value)}/>
              </label>
              <button type="button" disabled={pending || reopenNote.trim().length < 20}
                onClick={()=>submit(reopenCommercialLegalReviewAction(pkg.id,saleId,reopenNote),
                  "Aprovação reaberta antes da emissão; ajuste e encaminhe novamente.")}>
                Reabrir para ajustes
              </button>
            </div>
          ) : null}
          {canReview && reviewEvents.length > 0 ? (
            <div className="form-section">
              <h3>Histórico da conferência jurídica</h3>
              <ul className="helper-text">
                {reviewEvents.map(event=>(
                  <li key={event.id}>
                    {event.event_type === "approved" ? "Aprovação" : "Reabertura para correções"}
                    {" "}— {new Date(event.occurred_at).toLocaleString("pt-BR")}:
                    {" "}{event.note}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {issuedDocuments.length > 0 ? (
            <div className="form-section">
              <h3>Documentos emitidos ({issuedDocuments.length})</h3>
              {issuedDocuments.map(doc=>(
                <p key={doc.id} className="helper-text">
                  <a href={"/sistema/publicidade/vendas/"+saleId+"/documentos/"+doc.id}>
                    {doc.title} · versão {doc.template_version} · PDF privado
                  </a>
                  {" "}— emitido em {new Date(doc.issued_at).toLocaleDateString("pt-BR")}
                </p>
              ))}
              <p className="helper-text">Documentos emitidos ainda não estão assinados.
                A integração de assinaturas comerciais será homologada separadamente.</p>
            </div>
          ) : null}
          <div className="form-actions">
            <button type="button" disabled={pending || previewBusy || (!canPrepare && !canReview)}
              onClick={() => void showPreview()}>
              {previewBusy ? "Montando conferência…" : "Visualizar conferência dos serviços"}
            </button>
          </div>
          {preview ? (
            <div className="form-section" aria-live="polite">
              <h3>Prévia operacional — NÃO É CONTRATO PARA ASSINATURA</h3>
              <p className="helper-text">Nenhum PDF ou documento foi salvo. Os preços vêm da venda e os prazos são específicos de cada serviço.</p>
              {preview.missing.length > 0 ? (
                <div role="status">
                  <strong>Campos pendentes ({preview.missing.length})</strong>
                  <ul>{preview.missing.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </div>
              ) : <p className="helper-text">Dados operacionais conferidos. Ainda faltam cláusulas jurídicas e modelo aprovado.</p>}
              {preview.documents.map((doc, index) => (
                <div key={index} className="form-section">
                  <strong>{doc.title}</strong>
                  <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "inherit", lineHeight: 1.6 }}>
                    {doc.text}
                  </pre>
                </div>
              ))}
            </div>
          ) : null}
          <p className="helper-text">
            A minuta PDF é temporária, marcada como não assinável. Se um modelo tiver
            campos personalizados sem valor, o download será bloqueado e mostrará os campos faltantes.
            Revisão jurídica é uma etapa interna, não uma assinatura. Nenhum modelo de cláusulas
            será considerado aprovado sem validação e sem o documento final vinculado ao cliente.
          </p>
        </div>
      )}
    </section>
  );
}
