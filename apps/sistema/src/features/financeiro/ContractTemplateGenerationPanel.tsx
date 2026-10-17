"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContractTemplate, ContractTemplateVariable } from "@ir/types";
import {
  generateContractFromTemplateAction, previewContractFromTemplateAction,
} from "../../app/sistema/financeiro/contratos/template-generation-actions";

/**
 * Fluxo: Selecionar modelo → Preencher dados → Conferir PDF → Gerar
 * documento (Item 5, Lote 3, Tarefa 4). Os dados do cliente/contrato
 * são preenchidos automaticamente no servidor — aqui só os campos
 * variáveis extras do modelo (quando houver) são pedidos ao operador.
 */
export function ContractTemplateGenerationPanel({
  contractId, templates,
}: { contractId: string; templates: ContractTemplate[] }): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ resolvedContent: string; missingRequired: ContractTemplateVariable[] } | null>(null);
  const [error, setError] = useState("");
  const [generatedName, setGeneratedName] = useState("");

  const selectedTemplate = templates.find((t) => t.id === templateId);

  function setValue(key: string, value: string): void {
    setCustomValues((old) => ({ ...old, [key]: value }));
    setPreview(null);
  }

  function runPreview(): void {
    setError(""); setGeneratedName("");
    startTransition(async () => {
      const result = await previewContractFromTemplateAction({ contractId, templateId, customValues });
      if ("error" in result) { setError(result.error); return; }
      setPreview({ resolvedContent: result.resolvedContent, missingRequired: result.missingRequired });
    });
  }

  function generate(): void {
    setError("");
    startTransition(async () => {
      const result = await generateContractFromTemplateAction({ contractId, templateId, customValues });
      if ("error" in result) { setError(result.error); return; }
      setGeneratedName(result.document.name);
      setPreview(null);
      router.refresh();
    });
  }

  if (templates.length === 0) {
    return (
      <section className="form-section">
        <h2>Gerar contrato a partir de modelo</h2>
        <p className="helper-text">
          Nenhum modelo ativo disponível ainda. Cadastre um em{" "}
          <a className="materia-title-link" href="/sistema/financeiro/modelos-contrato">Modelos de contrato</a>.
        </p>
      </section>
    );
  }

  return (
    <section className="form-section">
      <h2>Gerar contrato a partir de modelo</h2>
      <p className="helper-text">
        Os dados do cliente e do contrato já cadastrados são preenchidos automaticamente — nunca substitui o upload manual de PDF, é uma
        opção adicional.
      </p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {generatedName ? <p className="helper-text"><strong>PDF gerado:</strong> {generatedName} — disponível na lista de documentos abaixo.</p> : null}

      <div className="form-grid">
        <label className="form-field">
          <span className="field-label">Modelo</span>
          <select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setCustomValues({}); setPreview(null); }}>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.title} (v{t.version})</option>)}
          </select>
        </label>
        {selectedTemplate?.variables.map((variable) => (
          <label className="form-field" key={variable.key}>
            <span className="field-label">{variable.label}{variable.required ? " *" : ""}</span>
            <input value={customValues[variable.key] ?? ""} onChange={(e) => setValue(variable.key, e.target.value)} />
          </label>
        ))}
      </div>

      <div className="form-actions" style={{ marginTop: 12 }}>
        <button type="button" onClick={runPreview} disabled={pending || !templateId}>
          {pending ? "Conferindo…" : "Pré-visualizar"}
        </button>
        <button type="button" className="form-action-primary" onClick={generate}
          disabled={pending || !templateId || (preview !== null && preview.missingRequired.length > 0)}>
          {pending ? "Gerando…" : "Gerar PDF definitivo"}
        </button>
      </div>

      {preview ? (
        preview.missingRequired.length > 0 ? (
          <p className="form-error" role="alert">
            Preencha antes de gerar: {preview.missingRequired.map((v) => v.label).join(", ")}.
          </p>
        ) : (
          <details className="more-options" style={{ marginTop: 12 }} open>
            <summary>Conferir conteúdo antes de gerar</summary>
            <div className="more-options-panel">
              <pre style={{ maxHeight: "20rem", overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {preview.resolvedContent}
              </pre>
            </div>
          </details>
        )
      ) : null}
    </section>
  );
}
