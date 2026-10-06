"use client";

import { useState, useTransition } from "react";
import type { Client, ContractDocumentExtractedData, ContractDocumentType } from "@ir/types";
import { CONTRACT_DOCUMENT_TYPE_LABELS, CONTRACT_DOCUMENT_TYPES } from "@ir/types";
import { analyzeContractDocumentAction, createContractWithDocument } from "../../app/sistema/financeiro/contratos/actions";
import { ContractForm } from "./ContractForm";
import type { ContractFormPayload } from "./contractFormTypes";

function emptyPayload(initialClientId?: string): ContractFormPayload {
  return {
    clientId: initialClientId ?? "",
    contractNumber: "",
    processNumber: "",
    modality: "",
    biddingReference: "",
    object: "",
    contractedAmount: "",
    startsAt: "",
    endsAt: "",
    status: "active",
    notes: "",
  };
}

const FIELD_LABELS: Record<keyof ContractDocumentExtractedData, string> = {
  organizationName: "Órgão/contratante",
  organizationCnpj: "CNPJ",
  contractNumber: "Número do contrato",
  processNumber: "Número do processo",
  modality: "Modalidade",
  biddingReference: "Referência da licitação",
  object: "Objeto",
  commitmentOrder: "Empenho",
  startsAt: "Início da vigência",
  endsAt: "Fim da vigência",
  contractedAmount: "Valor contratado",
  competencyDate: "Competência",
};

function applyExtractedData(extracted: ContractDocumentExtractedData, initialClientId?: string): ContractFormPayload {
  const payload = emptyPayload(initialClientId);
  if (extracted.contractNumber) payload.contractNumber = extracted.contractNumber;
  if (extracted.processNumber) payload.processNumber = extracted.processNumber;
  if (extracted.modality) payload.modality = extracted.modality;
  if (extracted.biddingReference) payload.biddingReference = extracted.biddingReference;
  if (extracted.object) payload.object = extracted.object;
  if (extracted.contractedAmount !== undefined) payload.contractedAmount = String(extracted.contractedAmount);
  if (extracted.startsAt) payload.startsAt = extracted.startsAt;
  if (extracted.endsAt) payload.endsAt = extracted.endsAt;
  return payload;
}

type WizardStep = 1 | 2 | 3 | 4;

/**
 * Fluxo "documento primeiro" de novo contrato institucional (ajuste
 * final da Parte 3A): Documento -> Conferência dos dados extraídos ->
 * Complemento dos dados -> Revisão/salvamento. O arquivo nunca é
 * enviado para armazenamento real (Storage indisponível nesta fase) —
 * só os bytes são lidos uma vez, transitoriamente, para a análise de
 * texto (ver analyzeContractDocumentAction). O contrato só é criado no
 * Passo 4, e o documento (quando houver) é persistido imediatamente
 * depois, na mesma ação — o usuário nunca precisa de um contrato
 * "vazio" esperando o anexo.
 */
export function ContractIntakeWizard({
  clients,
  initialClientId,
}: {
  clients: Client[];
  initialClientId?: string;
}): JSX.Element {
  const [step, setStep] = useState<WizardStep>(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<ContractDocumentType>("contract");
  const [documentName, setDocumentName] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [documentNotes, setDocumentNotes] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [hasTextLayer, setHasTextLayer] = useState<boolean | null>(null);
  const [extractedData, setExtractedData] = useState<ContractDocumentExtractedData | null>(null);
  const [skipDocument, setSkipDocument] = useState(false);

  const [contractPayload, setContractPayload] = useState<ContractFormPayload>(emptyPayload(initialClientId));

  function handleFileSelected(file: File | null): void {
    setSelectedFile(file);
    setHasTextLayer(null);
    setExtractedData(null);
    if (file && !documentName.trim()) setDocumentName(file.name.replace(/\.[^.]+$/, ""));
  }

  function handleAnalyze(): void {
    if (!selectedFile) return;
    setError(null);
    setAnalyzing(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    startTransition(async () => {
      const result = await analyzeContractDocumentAction(formData);
      setAnalyzing(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setHasTextLayer(result.hasTextLayer);
      setExtractedData(result.fields);
      setStep(2);
    });
  }

  function handleUseExtractedData(): void {
    if (extractedData) setContractPayload(applyExtractedData(extractedData, initialClientId));
    setStep(3);
  }

  function handleSkipExtractedData(): void {
    setContractPayload(emptyPayload(initialClientId));
    setStep(3);
  }

  function handleSkipDocumentEntirely(): void {
    setSkipDocument(true);
    setSelectedFile(null);
    setContractPayload(emptyPayload(initialClientId));
    setStep(3);
  }

  function handleSave(): void {
    setError(null);
    startTransition(async () => {
      const result = await createContractWithDocument(
        contractPayload,
        !skipDocument && documentName.trim()
          ? {
              documentType,
              name: documentName,
              // Referência textual só do nome do arquivo — upload real
              // (R2) é módulo futuro; nada é enviado para armazenamento.
              fileReference: selectedFile?.name ?? "",
              documentDate,
              notes: documentNotes,
              extractedData: extractedData ?? undefined,
            }
          : undefined,
      );
      if (result && "error" in result) setError(result.error);
    });
  }

  const extractedEntries = extractedData
    ? (Object.entries(extractedData) as [keyof ContractDocumentExtractedData, string | number][]).filter(([, value]) => value !== undefined && value !== "")
    : [];

  return (
    <div className="inline-form">
      <section className="form-section form-section--first">
        <div className="destaques-block-head">
          <h2>Passo {step} de 4</h2>
          <span className="materias-count">
            {step === 1 ? "Documento" : step === 2 ? "Conferência dos dados extraídos" : step === 3 ? "Complemento dos dados do contrato" : "Revisão/salvamento"}
          </span>
        </div>
      </section>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {step === 1 ? (
        <section className="form-section">
          <h2>Documento</h2>
          <p className="helper-text">
            Contrato, processo, licitação, empenho, aditivo, autorização ou outro documento relacionado. Upload real ainda não está disponível — o arquivo fica só na sua tela para a análise de texto, nada é enviado para armazenamento.
          </p>
          <div className="form-grid">
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Arquivo</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => handleFileSelected(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="form-field">
              <span className="field-label">Tipo de documento</span>
              <select value={documentType} onChange={(event) => setDocumentType(event.target.value as ContractDocumentType)}>
                {CONTRACT_DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {CONTRACT_DOCUMENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="field-label">Nome/descrição</span>
              <input type="text" value={documentName} onChange={(event) => setDocumentName(event.target.value)} />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="form-action-primary" onClick={handleAnalyze} disabled={!selectedFile || analyzing || pending}>
              {analyzing ? "Analisando…" : "Analisar documento"}
            </button>
            <button type="button" onClick={handleSkipDocumentEntirely} disabled={pending}>
              Continuar sem documento agora
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="form-section">
          <h2>Conferência dos dados extraídos</h2>
          {hasTextLayer === false ? (
            <p className="helper-text">
              Este documento parece ser uma imagem/PDF escaneado (sem camada de texto) — não foi possível extrair dados automaticamente. Vai precisar de OCR numa fase futura, ainda não implementado. Preencha os campos manualmente a seguir.
            </p>
          ) : extractedEntries.length === 0 ? (
            <p className="helper-text">Nenhum dado foi encontrado com segurança neste documento — preencha os campos manualmente a seguir.</p>
          ) : (
            <>
              <p className="helper-text">
                Dados encontrados no documento — SEMPRE confira antes de usar; nada aqui é definitivo. Campos não encontrados ficam vazios de propósito.
              </p>
              <div className="form-grid">
                {extractedEntries.map(([key, extractedValue]) => (
                  <div className="form-field" key={key}>
                    <span className="field-label">{FIELD_LABELS[key]}</span>
                    <span>{String(extractedValue)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="form-actions">
            {extractedEntries.length > 0 ? (
              <button type="button" className="form-action-primary" onClick={handleUseExtractedData} disabled={pending}>
                Usar estes dados e continuar
              </button>
            ) : null}
            <button type="button" onClick={handleSkipExtractedData} disabled={pending}>
              {extractedEntries.length > 0 ? "Ignorar e preencher manualmente" : "Continuar e preencher manualmente"}
            </button>
            <button type="button" onClick={() => setStep(1)} disabled={pending}>
              Voltar
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <>
          <ContractForm mode="create" clients={clients} value={contractPayload} onChange={setContractPayload} hideActions />
          <section className="form-section">
            <div className="form-actions">
              <button type="button" className="form-action-primary" onClick={() => setStep(4)} disabled={pending}>
                Continuar para revisão
              </button>
              <button type="button" onClick={() => setStep(skipDocument ? 1 : 2)} disabled={pending}>
                Voltar
              </button>
            </div>
          </section>
        </>
      ) : null}

      {step === 4 ? (
        <section className="form-section">
          <h2>Revisão/salvamento</h2>
          <div className="form-grid">
            <div className="form-field">
              <span className="field-label">Documento</span>
              <span>{skipDocument ? "Nenhum documento anexado agora" : documentName || "(sem nome)"}</span>
            </div>
            <div className="form-field">
              <span className="field-label">Cliente/órgão</span>
              <span>{clients.find((client) => client.id === contractPayload.clientId)?.reference ?? "—"}</span>
            </div>
            <div className="form-field">
              <span className="field-label">Número do contrato</span>
              <span>{contractPayload.contractNumber || "—"}</span>
            </div>
            <div className="form-field">
              <span className="field-label">Objeto</span>
              <span>{contractPayload.object || "—"}</span>
            </div>
            <div className="form-field">
              <span className="field-label">Valor contratado</span>
              <span>{contractPayload.contractedAmount || "—"}</span>
            </div>
            <div className="form-field">
              <span className="field-label">Vigência</span>
              <span>{contractPayload.startsAt || "—"} – {contractPayload.endsAt || "—"}</span>
            </div>
          </div>
          <p className="helper-text">
            Revise com atenção — depois de salvar, tudo continua editável normalmente na página do contrato.
          </p>
          <div className="form-actions">
            <button type="button" className="form-action-primary" onClick={handleSave} disabled={pending}>
              {pending ? "Salvando…" : "Salvar contrato" + (skipDocument ? "" : " e documento")}
            </button>
            <button type="button" onClick={() => setStep(3)} disabled={pending}>
              Voltar
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
