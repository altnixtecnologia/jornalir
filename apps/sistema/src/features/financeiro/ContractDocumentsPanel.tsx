"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContractDocument, ContractDocumentType } from "@ir/types";
import { CONTRACT_DOCUMENT_TYPE_LABELS, CONTRACT_DOCUMENT_TYPES } from "@ir/types";
import { uploadContractDocumentAction } from "../../app/sistema/financeiro/contratos/actions";

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

/**
 * Documentos do contrato (Parte 3A, itens 11-13) — fluxo orientado pelo
 * documento: anexar primeiro, depois (quando existir) a extração
 * automática mostra o que encontrou para o usuário conferir. REGRA
 * ABSOLUTA: o resultado da extração é só auxílio e nunca é aplicado
 * sozinho aos campos reais do contrato — o usuário sempre revisa e edita
 * manualmente (via "Editar" do contrato) antes de qualquer campo mudar.
 * PDFs reais: Supabase Storage privado; download somente por
 * URL temporária, com autenticação e escopo do contrato verificados.
 */
export function ContractDocumentsPanel({ contractId, documents }: { contractId: string; documents: ContractDocument[] }): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [documentType, setDocumentType] = useState<ContractDocumentType>("contract");
  const [name, setName] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [notes, setNotes] = useState("");

  function resetForm(): void {
    setName("");
    setFile(null);
    setDocumentDate("");
    setNotes("");
    setShowForm(false);
  }

  function handleSave(): void {
    setError(null);
    if (!name.trim() || !file) {
      setError("Informe um nome e selecione o PDF.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("O PDF precisa ter até 4 MB nesta etapa.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentType", documentType);
    formData.append("name", name);
    formData.append("documentDate", documentDate);
    formData.append("notes", notes);
    startTransition(async () => {
      try {
        const result = await uploadContractDocumentAction(contractId, formData);
        if (result && "error" in result) {
          setError(result.error);
          return;
        }
        resetForm();
        router.refresh();
      } catch {
        setError("Não foi possível enviar o PDF. Confira a conexão e tente novamente.");
      }
    });
  }

  return (
    <section className="form-section">
      <h2>Documentos</h2>
      <p className="helper-text">
        Contrato original, aditivos, empenhos, notas e autorizações. PDFs de até 4 MB são armazenados de forma privada e acessados apenas com autenticação.
      </p>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {!showForm ? (
        <div className="form-actions">
          <button type="button" onClick={() => setShowForm(true)} disabled={pending}>
            Anexar documento
          </button>
        </div>
      ) : (
        <div className="form-grid" style={{ marginTop: "12px" }}>
          <label className="form-field">
            <span className="field-label">Tipo</span>
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
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="ex.: Contrato nº 012/2026" />
          </label>
          <label className="form-field">
            <span className="field-label">Arquivo PDF (obrigatório)</span>
            <input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <label className="form-field">
            <span className="field-label">Data do documento <span className="field-optional">(opcional)</span></span>
            <input type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Observações <span className="field-optional">(opcional)</span></span>
            <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>

          <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
            <button type="button" className="form-action-primary" onClick={handleSave} disabled={pending}>
              {pending ? "Salvando…" : "Salvar documento"}
            </button>
            <button type="button" onClick={resetForm} disabled={pending}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {documents.length === 0 ? (
        <p className="helper-text" style={{ marginTop: "12px" }}>
          Nenhum documento anexado ainda.
        </p>
      ) : (
        <ul className="destaques-list" style={{ marginTop: "12px" }}>
          {documents.map((document) => (
            <li key={document.id} className="destaques-item">
              <div className="destaques-item-body">
                <span className="materia-title">{document.name}</span>
                <span className="helper-text">
                  {CONTRACT_DOCUMENT_TYPE_LABELS[document.documentType]} · {formatDate(document.documentDate)} · anexado em {formatDateTime(document.createdAt)}
                </span>
                {document.notes ? <span className="helper-text">{document.notes}</span> : null}
                {document.fileReference?.startsWith(`contracts/${contractId}/`) ? (
                  <a className="materia-title-link"
                    href={`/api/financeiro/contratos/${contractId}/documentos/${document.id}`}
                    target="_blank" rel="noopener noreferrer">Abrir PDF privado</a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
