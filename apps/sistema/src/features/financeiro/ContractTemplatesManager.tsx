"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CONTRACT_TEMPLATE_AUTO_FIELDS, type ContractTemplate, type ContractTemplateVariable } from "@ir/types";
import {
  createContractTemplateAction, createContractTemplateVersionAction, duplicateContractTemplateAction,
  listContractTemplateVersionsAction, setContractTemplateActiveAction, type ContractTemplateFormInput,
} from "../../app/sistema/financeiro/modelos-contrato/actions";

type EditorState = {
  mode: "create" | "edit";
  groupId?: string;
  title: string;
  description: string;
  category: string;
  content: string;
  variables: ContractTemplateVariable[];
};

const EMPTY_EDITOR: EditorState = { mode: "create", title: "", description: "", category: "", content: "", variables: [] };

/**
 * Área administrativa de modelos de contrato (Item 5, Lote 3, Tarefa 1).
 * "Editar" sempre cria uma versão NOVA (histórico preservado, nunca
 * sobrescrito); "Duplicar" cria um modelo independente.
 */
export function ContractTemplatesManager({ templates }: { templates: ContractTemplate[] }): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [error, setError] = useState("");
  const [historyFor, setHistoryFor] = useState<{ groupId: string; versions: ContractTemplate[] } | null>(null);
  const [newVarKey, setNewVarKey] = useState("");
  const [newVarLabel, setNewVarLabel] = useState("");
  const [newVarRequired, setNewVarRequired] = useState(true);

  const sorted = useMemo(() => [...templates].sort((a, b) => a.title.localeCompare(b.title, "pt-BR")), [templates]);

  function startCreate(): void {
    setError("");
    setEditor({ ...EMPTY_EDITOR });
  }

  function startEdit(template: ContractTemplate): void {
    setError("");
    setEditor({
      mode: "edit", groupId: template.groupId, title: template.title, description: template.description ?? "",
      category: template.category ?? "", content: template.content, variables: template.variables,
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

  function save(): void {
    if (!editor) return;
    setError("");
    const input: ContractTemplateFormInput = {
      title: editor.title, description: editor.description || undefined, category: editor.category || undefined,
      content: editor.content, variables: editor.variables,
    };
    startTransition(async () => {
      const result = editor.mode === "edit" && editor.groupId
        ? await createContractTemplateVersionAction(editor.groupId, input)
        : await createContractTemplateAction(input);
      if ("error" in result) { setError(result.error); return; }
      setEditor(null);
      router.refresh();
    });
  }

  function duplicate(template: ContractTemplate): void {
    setError("");
    startTransition(async () => {
      const result = await duplicateContractTemplateAction(template.id);
      if ("error" in result) { setError(result.error); return; }
      router.refresh();
    });
  }

  function toggleActive(template: ContractTemplate): void {
    setError("");
    startTransition(async () => {
      const result = await setContractTemplateActiveAction(template.id, !template.active);
      if ("error" in result) { setError(result.error); return; }
      router.refresh();
    });
  }

  function showHistory(template: ContractTemplate): void {
    setError("");
    startTransition(async () => {
      const result = await listContractTemplateVersionsAction(template.groupId);
      if ("error" in result) { setError(result.error); return; }
      setHistoryFor({ groupId: template.groupId, versions: result.versions });
    });
  }

  return (
    <>
      <section className="form-section form-section--first">
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="form-actions">
          <button type="button" className="form-action-primary" onClick={startCreate} disabled={pending}>+ Novo modelo</button>
        </div>
        {sorted.length === 0 ? (
          <p className="helper-text" style={{ marginTop: 12 }}>Nenhum modelo cadastrado ainda.</p>
        ) : (
          <ul className="destaques-list" style={{ marginTop: 12 }}>
            {sorted.map((template) => (
              <li className="destaques-item" key={template.id}>
                <div className="destaques-item-body">
                  <span className="materia-title">{template.title} — v{template.version}</span>
                  <span className="helper-text">
                    {template.category || "sem categoria"} · {template.active ? "Ativo" : "Inativo"}
                    {template.description ? " · " + template.description : ""}
                  </span>
                </div>
                <div className="form-actions">
                  <button type="button" disabled={pending} onClick={() => startEdit(template)}>Editar (nova versão)</button>
                  <button type="button" disabled={pending} onClick={() => duplicate(template)}>Duplicar</button>
                  <button type="button" disabled={pending} onClick={() => showHistory(template)}>Histórico de versões</button>
                  <button type="button" disabled={pending} onClick={() => toggleActive(template)}>
                    {template.active ? "Desativar" : "Ativar"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {historyFor ? (
        <section className="form-section">
          <h2>Histórico de versões</h2>
          <p className="helper-text">Versões anteriores nunca são alteradas — cada edição preserva a anterior intacta.</p>
          <ul className="destaques-list">
            {historyFor.versions.map((version) => (
              <li className="destaques-item" key={version.id}>
                <div className="destaques-item-body">
                  <span className="materia-title">v{version.version} — {version.title}</span>
                  <span className="helper-text">{new Date(version.createdAt).toLocaleString("pt-BR")} · {version.active ? "ativo" : "inativo"}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="form-actions">
            <button type="button" onClick={() => setHistoryFor(null)}>Fechar histórico</button>
          </div>
        </section>
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
              <span className="field-label">Categoria (referência, texto livre)</span>
              <input value={editor.category} onChange={(e) => setEditor({ ...editor, category: e.target.value })}
                placeholder="ex.: publicidade, prestacao_servicos, institucional" />
            </label>
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Descrição</span>
              <input value={editor.description} onChange={(e) => setEditor({ ...editor, description: e.target.value })} maxLength={400} />
            </label>
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Conteúdo (texto puro, use {"{{chave}}"} para campos variáveis)</span>
              <textarea value={editor.content} onChange={(e) => setEditor({ ...editor, content: e.target.value })} rows={14} />
            </label>
          </div>

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

          <div className="form-actions" style={{ marginTop: 16 }}>
            <button type="button" className="form-action-primary" onClick={save}
              disabled={pending || editor.title.trim().length < 3 || !editor.content.trim()}>
              {pending ? "Salvando…" : editor.mode === "edit" ? "Salvar nova versão" : "Criar modelo"}
            </button>
            <button type="button" onClick={() => setEditor(null)}>Cancelar</button>
          </div>
        </section>
      ) : null}
    </>
  );
}
