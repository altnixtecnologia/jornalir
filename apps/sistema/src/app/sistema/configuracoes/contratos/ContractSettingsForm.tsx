"use client";

import { useState, useTransition } from "react";
import type { ContractSettings } from "../../../../lib/contracts/contractTemplates";
import { saveContractDocumentSettings } from "./actions";

const FIELDS = [
  { key: "legalName", label: "Razão social contratante (obrigatória após confirmação)" },
  { key: "tradeName", label: "Nome público / marca" },
  { key: "cnpj", label: "CNPJ do contratante" },
  { key: "representative", label: "Representante legal do jornal" },
  { key: "address", label: "Endereço da empresa (confirmar documento societário)" },
  { key: "phone", label: "Telefone / WhatsApp" },
  { key: "email", label: "E-mail" },
] as const;

const MODELS = [
  { key: "annualText", title: "Assinatura anual do impresso", description: "Entrega, exemplares, vigência, cobrança e direitos aplicáveis." },
  { key: "printText", title: "Publicidade no impresso", description: "Formato, edição, arte, prazo e responsabilidades." },
  { key: "ledText", title: "Publicidade no painel LED", description: "Local, duração da peça, inserções, período e indisponibilidade." },
  { key: "mixedText", title: "Serviços combinados", description: "Vários serviços, preço total e condições individualizadas." },
] as const;

export function ContractSettingsForm({ initial, storageReady }: { initial: ContractSettings; storageReady: boolean }): JSX.Element {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  function submit(form: FormData): void {
    setError(null); setMessage(null);
    startTransition(async () => {
      const result = await saveContractDocumentSettings(form);
      if ("error" in result) setError(result.error);
      else setMessage("Minutas e dados do jornal salvos. Ainda não habilitados para assinatura.");
    });
  }
  return (
    <form action={submit} className="inline-form">
      {!storageReady ? <p className="form-error" role="alert">Configuração em preparação: a migration ainda precisa de homologação no Supabase. Os campos abaixo exibem os valores iniciais.</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="helper-text" role="status">{message}</p> : null}
      <section className="form-section form-section--first">
        <h2>Dados que aparecerão nos contratos</h2>
        <img src="/brand/logo-escrita.png" alt="Logo do Informativo Regional" style={{ maxWidth: 220, maxHeight: 72, objectFit: "contain" }} />
        <p className="helper-text">Logo oficial já utilizado no painel. Razão social, CNPJ e representante ficam em branco até conferência dos documentos da empresa.</p>
        <div className="form-grid">
          {FIELDS.map((field) => (
            <label key={field.key} className="form-field">
              <span className="field-label">{field.label}</span>
              <input name={field.key} type="text" defaultValue={initial[field.key]} maxLength={300} />
            </label>
          ))}
        </div>
      </section>
      <section className="form-section">
        <h2>Modelos de cláusulas — minutas para revisão jurídica</h2>
        <p className="helper-text">O sistema preenche automaticamente cliente, serviços, valores e períodos. Estes textos são editáveis; salvar uma minuta não significa aprovação jurídica.</p>
        {MODELS.map((model) => (
          <label key={model.key} className="form-field" style={{ display: "block", marginBottom: 20 }}>
            <span className="field-label">{model.title}</span>
            <span className="helper-text">{model.description}</span>
            <textarea name={model.key} defaultValue={initial[model.key]} rows={5} maxLength={10000} style={{ width: "100%" }} />
          </label>
        ))}
        <button className="form-action-primary" type="submit" disabled={pending || !storageReady}>
          {pending ? "Salvando..." : "Salvar dados e minutas"}
        </button>
      </section>
      <section className="form-section">
        <h2>Envio e assinatura</h2>
        <p className="helper-text">Bloqueados até homologação do motor de assinatura, aprovação das cláusulas, comprovação de integridade e identificação do signatário. Após isso, o operador terá somente Conferir e Enviar WhatsApp.</p>
      </section>
    </form>
  );
}
