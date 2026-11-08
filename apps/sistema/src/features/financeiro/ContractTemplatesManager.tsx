"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CONTRACT_TEMPLATE_AUTO_FIELDS,
  CONTRACT_TEMPLATE_MODALITY_LABELS,
  CONTRACT_TEMPLATE_SPECIFIC_SUGGESTIONS,
  CONTRACT_TEMPLATE_TEST_BANNER,
  contractTemplateStage,
  type ContractTemplate,
  type ContractTemplateDocumentMode,
  type ContractTemplateModality,
  type ContractTemplateVariable,
} from "@ir/types";
import {
  createContractTemplateAction, createContractTemplateVersionAction, duplicateContractTemplateAction,
  getContractTemplateDocumentUrlAction, listContractTemplateVersionsAction,
  recordContractTemplateLegalApprovalAction, revokeContractTemplateLegalApprovalAction,
  setContractTemplateActiveAction, setContractTemplateTestModeAction, uploadContractTemplateDocumentAction,
  type ContractTemplateFormInput,
} from "../../app/sistema/financeiro/modelos-contrato/actions";
import { notify } from "../../lib/feedback/notify";
import { SignatureFieldLayoutEditor } from "./SignatureFieldLayoutEditor";

type EditorState = {
  mode: "create" | "edit";
  groupId?: string;
  title: string;
  description: string;
  category: string;
  content: string;
  variables: ContractTemplateVariable[];
  modality: ContractTemplateModality | "";
  specificFor: string;
  documentMode: ContractTemplateDocumentMode;
  attachment?: { path: string; sha256: string; bytes: number };
  attachmentName?: string;
};

const EMPTY_EDITOR: EditorState = {
  mode: "create", title: "", description: "", category: "", content: "", variables: [],
  modality: "", specificFor: "", documentMode: "text",
};

const STAGE_LABEL = { draft: "Rascunho", test: "TESTE — sem efeito contratual", production: "PRODUÇÃO" } as const;

type PendingAction = { kind: "approve" | "revoke"; template: ContractTemplate } | null;

/**
 * Gestão de modelos de contrato (Etapa 1, 08/11/2026). "Editar" sempre cria
 * uma versão NOVA (histórico preservado); "Duplicar" cria um modelo
 * independente. Estados por versão: Rascunho → TESTE (minuta de teste, sem
 * efeito contratual) e PRODUÇÃO (só com aprovação jurídica registrada por
 * administrador/proprietário). Teste e produção são independentes.
 */
export function ContractTemplatesManager({
  templates,
  canApprove = false,
}: {
  templates: ContractTemplate[];
  /** Administrador/proprietário: registra/revoga aprovação jurídica e ativa produção. */
  canApprove?: boolean;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [historyFor, setHistoryFor] = useState<{ groupId: string; versions: ContractTemplate[] } | null>(null);
  const [positioningFor, setPositioningFor] = useState<ContractTemplate | null>(null);
  const [action, setAction] = useState<PendingAction>(null);
  const [noteText, setNoteText] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [newVarKey, setNewVarKey] = useState("");
  const [newVarLabel, setNewVarLabel] = useState("");
  const [newVarRequired, setNewVarRequired] = useState(true);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const sorted = useMemo(() => [...templates].sort((a, b) => a.title.localeCompare(b.title, "pt-BR")), [templates]);

  function startCreate(): void {
    setEditor({ ...EMPTY_EDITOR });
  }

  function startEdit(template: ContractTemplate): void {
    setEditor({
      mode: "edit", groupId: template.groupId, title: template.title, description: template.description ?? "",
      category: template.category ?? "", content: template.documentMode === "fixed_pdf" ? "" : template.content,
      variables: template.variables, modality: template.modality ?? "", specificFor: template.specificFor ?? "",
      documentMode: template.documentMode,
      // Documento fixo: o PDF novo precisa ser reenviado ao criar a nova versão (o anexo nunca é reaproveitado em silêncio).
    });
  }

  function addVariable(): void {
    if (!newVarKey.trim() || !newVarLabel.trim() || !editor) return;
    setEditor({ ...editor, variables: [...editor.variables, { key: newVarKey.trim(), label: newVarLabel.trim(), required: newVarRequired }] });
    setNewVarKey(""); setNewVarLabel(""); setNewVarRequired(true);
  }

  function removeVariable(key: string): void {
    if (!editor) return;
    setEditor({ ...editor, variables: editor.variables.filter((v) => v.key !== key) });
  }

  function uploadDocument(file: File | undefined): void {
    if (!file || !editor) return;
    const data = new FormData();
    data.set("file", file);
    startTransition(async () => {
      const result = await uploadContractTemplateDocumentAction(data);
      if (fileRef.current) fileRef.current.value = "";
      if ("error" in result) { notify.error("Não foi possível enviar o PDF", result.error); return; }
      setEditor((current) => (current ? { ...current, attachment: result.attachment, attachmentName: file.name } : current));
      notify.success("PDF enviado", "Guardado em área privada. Salve o modelo para vinculá-lo a esta versão.");
    });
  }

  function save(): void {
    if (!editor || !editor.modality) return;
    const isNewVersion = editor.mode === "edit" && editor.groupId;
    const input: ContractTemplateFormInput = {
      title: editor.title, description: editor.description || undefined, category: editor.category || undefined,
      content: editor.documentMode === "fixed_pdf" ? "" : editor.content,
      variables: editor.documentMode === "fixed_pdf" ? [] : editor.variables,
      modality: editor.modality, specificFor: editor.specificFor || undefined,
      documentMode: editor.documentMode, attachment: editor.documentMode === "fixed_pdf" ? editor.attachment : undefined,
    };
    startTransition(async () => {
      const result = isNewVersion
        ? await createContractTemplateVersionAction(editor.groupId!, input)
        : await createContractTemplateAction(input);
      if ("error" in result) { notify.error("Não foi possível salvar o modelo", result.error); return; }
      setEditor(null);
      notify.success(isNewVersion ? "Nova versão salva" : "Modelo criado",
        isNewVersion
          ? "A nova versão nasce como rascunho: precisa de teste e aprovação jurídica própria antes da produção."
          : "O modelo nasceu como rascunho (não está em teste nem em produção).");
      router.refresh();
    });
  }

  function duplicate(template: ContractTemplate): void {
    startTransition(async () => {
      const result = await duplicateContractTemplateAction(template.id);
      if ("error" in result) { notify.error("Não foi possível duplicar o modelo", result.error); return; }
      notify.success("Modelo duplicado", "Um modelo independente foi criado como rascunho.");
      router.refresh();
    });
  }

  function toggleTest(template: ContractTemplate): void {
    startTransition(async () => {
      const result = await setContractTemplateTestModeAction(template.id, !template.testEnabled);
      if ("error" in result) { notify.error("Não foi possível alterar o modo de teste", result.error); return; }
      notify.success(template.testEnabled ? "Modo de teste desligado" : "Habilitado para TESTE",
        template.testEnabled ? "A minuta não pode mais ser usada em homologação." : `${CONTRACT_TEMPLATE_TEST_BANNER}. Isto não é produção.`);
      router.refresh();
    });
  }

  function toggleProduction(template: ContractTemplate): void {
    startTransition(async () => {
      const result = await setContractTemplateActiveAction(template.id, !template.active);
      if ("error" in result) { notify.error("Não foi possível alterar a produção", result.error); return; }
      notify.success(template.active ? "Modelo desativado da produção" : "Modelo ativo em PRODUÇÃO",
        template.active ? "O modelo não aparece mais para novos contratos reais." : "A ativação foi registrada na auditoria com a versão aprovada.");
      router.refresh();
    });
  }

  function confirmAction(): void {
    if (!action) return;
    const { kind, template } = action;
    startTransition(async () => {
      const result = kind === "approve"
        ? await recordContractTemplateLegalApprovalAction(template.id, noteText, evidenceText)
        : await revokeContractTemplateLegalApprovalAction(template.id, noteText);
      if ("error" in result) { notify.error(kind === "approve" ? "Não foi possível registrar a aprovação" : "Não foi possível revogar", result.error); return; }
      setAction(null); setNoteText(""); setEvidenceText("");
      notify.success(kind === "approve" ? "Aprovação jurídica registrada" : "Aprovação revogada",
        kind === "approve" ? "Registrada com aprovador, data, evidência e hash do conteúdo. Ainda é preciso ativar para produção." : "A produção foi desativada na mesma operação.");
      router.refresh();
    });
  }

  function openDocument(template: ContractTemplate): void {
    startTransition(async () => {
      const result = await getContractTemplateDocumentUrlAction(template.id);
      if ("error" in result) { notify.error("Não foi possível abrir o documento", result.error); return; }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  function showHistory(template: ContractTemplate): void {
    startTransition(async () => {
      const result = await listContractTemplateVersionsAction(template.groupId);
      if ("error" in result) { notify.error("Não foi possível carregar o histórico", result.error); return; }
      setHistoryFor({ groupId: template.groupId, versions: result.versions });
    });
  }

  const canSave = !!editor && !pending && editor.title.trim().length >= 3 && !!editor.modality
    && (editor.documentMode === "fixed_pdf" ? !!editor.attachment : !!editor.content.trim());

  return (
    <>
      <section className="form-section form-section--first">
        <p className="helper-text">
          Cada versão tem estado próprio: <strong>Rascunho</strong>, <strong>{STAGE_LABEL.test}</strong> (minuta para homologação,
          sem cobrança, ativação de serviço, publicação ou assinatura de obrigação real) e <strong>PRODUÇÃO</strong> (somente após
          aprovação jurídica registrada por administrador/proprietário). Clicar em &quot;Ativar&quot; nunca substitui o parecer jurídico.
        </p>
        <div className="form-actions">
          <button type="button" className="form-action-primary" onClick={startCreate} disabled={pending}>+ Novo modelo</button>
        </div>
        {sorted.length === 0 ? (
          <p className="helper-text" style={{ marginTop: 12 }}>Nenhum modelo cadastrado ainda.</p>
        ) : (
          <ul className="destaques-list" style={{ marginTop: 12 }}>
            {sorted.map((template) => {
              const stage = contractTemplateStage(template);
              return (
                <li className="destaques-item" key={template.id}>
                  <div className="destaques-item-body">
                    <span className="materia-title">{template.title} — v{template.version}</span>
                    <span className="helper-text">
                      <strong>{STAGE_LABEL[stage]}</strong>
                      {template.testEnabled && stage === "production" ? " (também habilitado para teste)" : ""}
                      {" · "}{template.modality ? CONTRACT_TEMPLATE_MODALITY_LABELS[template.modality] : "modalidade não definida"}
                      {template.specificFor ? ` · ${template.specificFor}` : ""}
                      {" · "}{template.category || "sem categoria"}
                      {template.documentMode === "fixed_pdf" ? " · documento fixo (PDF, sem mesclagem de variáveis)" : ""}
                      {template.description ? " · " + template.description : ""}
                    </span>
                    <span className="helper-text">
                      {template.legalApproval
                        ? `Aprovação jurídica: ${new Date(template.legalApproval.approvedAt).toLocaleDateString("pt-BR")} · evidência: ${template.legalApproval.evidence} · hash ${template.legalApproval.contentSha256.slice(0, 10)}…`
                        : "Sem aprovação jurídica registrada — não pode ir para produção."}
                    </span>
                  </div>
                  <div className="form-actions">
                    <button type="button" disabled={pending} onClick={() => startEdit(template)}>Editar (nova versão)</button>
                    <button type="button" disabled={pending} onClick={() => duplicate(template)}>Duplicar</button>
                    <button type="button" disabled={pending} onClick={() => showHistory(template)}>Histórico de versões</button>
                    {template.documentMode === "fixed_pdf" ? (
                      <>
                        <button type="button" disabled={pending} onClick={() => openDocument(template)}>Abrir PDF</button>
                        {canApprove ? <button type="button" disabled={pending || !!template.legalApproval || template.active}
                          title={template.legalApproval || template.active ? "Modelo aprovado: crie nova versão para alterar as posições." : undefined}
                          onClick={() => setPositioningFor(template)}>Posicionar assinaturas e rubricas</button> : null}
                      </>
                    ) : null}
                    <button type="button" disabled={pending} onClick={() => toggleTest(template)}>
                      {template.testEnabled ? "Desligar teste" : "Habilitar para teste"}
                    </button>
                    {canApprove ? (
                      template.legalApproval ? (
                        <button type="button" disabled={pending} onClick={() => { setNoteText(""); setAction({ kind: "revoke", template }); }}>
                          Revogar aprovação jurídica
                        </button>
                      ) : (
                        <button type="button" disabled={pending} onClick={() => { setNoteText(""); setEvidenceText(""); setAction({ kind: "approve", template }); }}>
                          Registrar aprovação jurídica
                        </button>
                      )
                    ) : null}
                    {template.active ? (
                      <button type="button" disabled={pending} onClick={() => toggleProduction(template)}>Desativar da produção</button>
                    ) : canApprove ? (
                      <button type="button" disabled={pending || !template.legalApproval} onClick={() => toggleProduction(template)}
                        title={template.legalApproval ? undefined : "Exige aprovação jurídica registrada para esta versão"}>
                        Ativar para produção
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {action ? (
        <section className="form-section" aria-label={action.kind === "approve" ? "Registrar aprovação jurídica" : "Revogar aprovação jurídica"}>
          <h2>{action.kind === "approve" ? "Registrar aprovação jurídica" : "Revogar aprovação jurídica"} — {action.template.title} v{action.template.version}</h2>
          <p className="helper-text">
            {action.kind === "approve"
              ? "Registre a revisão feita por profissional habilitado. Ficam gravados: quem aprovou, data, nota, evidência e o hash do texto desta versão."
              : "A produção desta versão será desativada na mesma operação. Informe o motivo."}
          </p>
          <div className="form-grid">
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">{action.kind === "approve" ? "Nota da revisão (mínimo 10 caracteres)" : "Motivo da revogação (mínimo 10 caracteres)"}</span>
              <textarea rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
            </label>
            {action.kind === "approve" ? (
              <label className="form-field" style={{ gridColumn: "1 / -1" }}>
                <span className="field-label">Evidência (parecer, e-mail, identificação do advogado)</span>
                <input value={evidenceText} onChange={(e) => setEvidenceText(e.target.value)} />
              </label>
            ) : null}
          </div>
          <div className="form-actions">
            <button type="button" className="form-action-primary" disabled={pending || noteText.trim().length < 10 || (action.kind === "approve" && evidenceText.trim().length < 3)} onClick={confirmAction}>
              {pending ? "Registrando…" : action.kind === "approve" ? "Registrar aprovação" : "Revogar"}
            </button>
            <button type="button" onClick={() => setAction(null)}>Cancelar</button>
          </div>
        </section>
      ) : null}

      {historyFor ? (
        <section className="form-section">
          <h2>Histórico de versões</h2>
          <p className="helper-text">Versões anteriores nunca são alteradas — cada edição preserva a anterior intacta.</p>
          <ul className="destaques-list">
            {historyFor.versions.map((version) => (
              <li className="destaques-item" key={version.id}>
                <div className="destaques-item-body">
                  <span className="materia-title">v{version.version} — {version.title}</span>
                  <span className="helper-text">
                    {new Date(version.createdAt).toLocaleString("pt-BR")} · {STAGE_LABEL[contractTemplateStage(version)]}
                    {version.legalApproval ? ` · aprovada em ${new Date(version.legalApproval.approvedAt).toLocaleDateString("pt-BR")}` : " · sem aprovação"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <div className="form-actions">
            <button type="button" onClick={() => setHistoryFor(null)}>Fechar histórico</button>
          </div>
        </section>
      ) : null}

      {positioningFor ? (
        <SignatureFieldLayoutEditor templateId={positioningFor.id} title={positioningFor.title}
          version={positioningFor.version} onClose={() => setPositioningFor(null)} />
      ) : null}

      {editor ? (
        <section className="form-section">
          <h2>{editor.mode === "edit" ? "Editar modelo (cria nova versão)" : "Novo modelo"}</h2>
          <div className="form-grid">
            <label className="form-field">
              <span className="field-label">Título</span>
              <input value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} maxLength={180} />
            </label>
            <label className="form-field">
              <span className="field-label">Modalidade (obrigatória)</span>
              <select value={editor.modality} onChange={(e) => setEditor({ ...editor, modality: e.target.value as ContractTemplateModality | "" })}>
                <option value="">Selecione…</option>
                <option value="commercial">{CONTRACT_TEMPLATE_MODALITY_LABELS.commercial}</option>
                <option value="institutional">{CONTRACT_TEMPLATE_MODALITY_LABELS.institutional}</option>
              </select>
            </label>
            <label className="form-field">
              <span className="field-label">Específico para (licitação, prefeitura, Câmara… opcional)</span>
              <input value={editor.specificFor} onChange={(e) => setEditor({ ...editor, specificFor: e.target.value })} list="template-specific-suggestions" maxLength={200}
                placeholder="ex.: Licitação — Prefeitura de São João" />
              <datalist id="template-specific-suggestions">
                {CONTRACT_TEMPLATE_SPECIFIC_SUGGESTIONS.map((item) => <option key={item} value={item} />)}
              </datalist>
            </label>
            <label className="form-field">
              <span className="field-label">Categoria (referência, texto livre)</span>
              <input value={editor.category} onChange={(e) => setEditor({ ...editor, category: e.target.value })}
                placeholder="ex.: publicidade, prestacao_servicos, institucional" />
            </label>
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Descrição</span>
              <input value={editor.description} onChange={(e) => setEditor({ ...editor, description: e.target.value })} maxLength={400} />
            </label>
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Tipo de documento</span>
              <select value={editor.documentMode} onChange={(e) => setEditor({ ...editor, documentMode: e.target.value as ContractTemplateDocumentMode })}>
                <option value="text">Texto com campos variáveis (editor abaixo)</option>
                <option value="fixed_pdf">Documento fixo em PDF (sem mesclagem de variáveis)</option>
              </select>
            </label>
          </div>

          {editor.documentMode === "fixed_pdf" ? (
            <div style={{ marginTop: 12 }}>
              <p className="helper-text" role="note">
                <strong>Limite:</strong> o PDF é usado exatamente como enviado. Nenhum campo (cliente, valores, datas) é preenchido
                automaticamente nele, e o conteúdo não é convertido nem editado. Cada uso exige conferência manual. Para um contrato
                com campos preenchidos automaticamente, use &quot;Texto com campos variáveis&quot;.
              </p>
              <div className="form-actions">
                <button type="button" disabled={pending} onClick={() => fileRef.current?.click()}>
                  {editor.attachment ? "Trocar PDF" : "Enviar PDF (até 10 MB)"}
                </button>
                <input ref={fileRef} type="file" accept="application/pdf" style={{ display: "none" }}
                  aria-label="Enviar PDF do documento fixo" onChange={(e) => uploadDocument(e.target.files?.[0])} />
                <span className="helper-text">
                  {editor.attachment
                    ? `${editor.attachmentName ?? "PDF"} · ${Math.round(editor.attachment.bytes / 1024)} KB · hash ${editor.attachment.sha256.slice(0, 10)}…`
                    : "Nenhum PDF enviado ainda."}
                </span>
              </div>
            </div>
          ) : (
            <>
              <label className="form-field" style={{ gridColumn: "1 / -1", marginTop: 12 }}>
                <span className="field-label">Conteúdo (texto puro, use {"{{chave}}"} para campos variáveis)</span>
                <textarea value={editor.content} onChange={(e) => setEditor({ ...editor, content: e.target.value })} rows={14} />
              </label>

              <h3 style={{ marginTop: 16 }}>Campos preenchidos automaticamente (cliente/contrato)</h3>
              <p className="helper-text">
                Use estas chaves no conteúdo — são preenchidas sozinhas a partir do cadastro, nunca inventadas:{" "}
                {CONTRACT_TEMPLATE_AUTO_FIELDS.map((field) => `{{${field.key}}}`).join(", ")}.
              </p>

              <h3 style={{ marginTop: 16 }}>Campos variáveis adicionais</h3>
              {editor.variables.length > 0 ? (
                <ul className="destaques-list">
                  {editor.variables.map((variable) => (
                    <li className="destaques-item" key={variable.key}>
                      <div className="destaques-item-body">
                        <span className="materia-title">{"{{" + variable.key + "}}"} — {variable.label}</span>
                        <span className="helper-text">{variable.required ? "obrigatório" : "opcional"}</span>
                      </div>
                      <button type="button" onClick={() => removeVariable(variable.key)}>Remover</button>
                    </li>
                  ))}
                </ul>
              ) : <p className="helper-text">Nenhum campo variável adicional ainda.</p>}
              <div className="form-grid" style={{ marginTop: 8 }}>
                <label className="form-field">
                  <span className="field-label">Chave (ex.: forma_pagamento)</span>
                  <input value={newVarKey} onChange={(e) => setNewVarKey(e.target.value)} />
                </label>
                <label className="form-field">
                  <span className="field-label">Rótulo exibido ao operador</span>
                  <input value={newVarLabel} onChange={(e) => setNewVarLabel(e.target.value)} />
                </label>
                <label className="form-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={newVarRequired} onChange={(e) => setNewVarRequired(e.target.checked)} />
                  Obrigatório
                </label>
                <div className="form-actions">
                  <button type="button" onClick={addVariable} disabled={!newVarKey.trim() || !newVarLabel.trim()}>+ Adicionar campo</button>
                </div>
              </div>
            </>
          )}

          <p className="helper-text" style={{ marginTop: 12 }}>
            Toda versão nova nasce como <strong>Rascunho</strong> — sem teste e sem produção — e precisa de aprovação jurídica própria.
          </p>
          <div className="form-actions" style={{ marginTop: 8 }}>
            <button type="button" className="form-action-primary" onClick={save} disabled={!canSave}>
              {pending ? "Salvando…" : editor.mode === "edit" ? "Salvar nova versão" : "Criar modelo"}
            </button>
            <button type="button" onClick={() => setEditor(null)}>Cancelar</button>
          </div>
        </section>
      ) : null}
    </>
  );
}
