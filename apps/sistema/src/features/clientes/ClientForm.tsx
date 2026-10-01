"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Client, ClientRole } from "@ir/types";
import { CLIENT_ROLES, CLIENT_ROLE_LABELS } from "@ir/types";
import { createClient, updateClient } from "../../app/sistema/clientes/actions";
import type { ClientFormPayload } from "./clientFormTypes";

function payloadFromClient(client?: Client): ClientFormPayload {
  return {
    kind: client?.kind ?? "individual",
    status: client?.status ?? "active",
    fullName: client?.fullName ?? "",
    cpf: client?.cpf ?? "",
    birthDate: client?.birthDate ?? "",
    companyName: client?.companyName ?? "",
    tradeName: client?.tradeName ?? "",
    cnpj: client?.cnpj ?? "",
    stateRegistration: client?.stateRegistration ?? "",
    responsibleName: client?.responsibleName ?? "",
    responsibleCpf: client?.responsibleCpf ?? "",
    phonePrimary: client?.phonePrimary ?? "",
    phoneSecondary: client?.phoneSecondary ?? "",
    whatsapp: client?.whatsapp ?? "",
    email: client?.email ?? "",
    addressZip: client?.address?.zip ?? "",
    addressStreet: client?.address?.street ?? "",
    addressNumber: client?.address?.number ?? "",
    addressComplement: client?.address?.complement ?? "",
    addressNeighborhood: client?.address?.neighborhood ?? "",
    addressCity: client?.address?.city ?? "",
    addressState: client?.address?.state ?? "",
    notes: client?.notes ?? "",
    roles: client?.roles ?? [],
  };
}

interface ClientFormProps {
  mode: "create" | "edit";
  client?: Client;
}

/**
 * Cadastro central de clientes (Fase 1). Ao escolher Pessoa física/jurídica
 * só os campos correspondentes aparecem (requisito 8). Organizado em
 * blocos (.form-section, mesma convenção visual do editorial) em vez de
 * uma tela só com todos os campos juntos.
 */
export function ClientForm({ mode, client }: ClientFormProps): JSX.Element {
  const router = useRouter();
  const [payload, setPayload] = useState<ClientFormPayload>(() => payloadFromClient(client));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof ClientFormPayload>(key: K, value: ClientFormPayload[K]): void {
    setPayload((prev) => ({ ...prev, [key]: value }));
  }

  function toggleRole(role: ClientRole): void {
    setPayload((prev) => ({
      ...prev,
      roles: prev.roles.includes(role) ? prev.roles.filter((r) => r !== role) : [...prev.roles, role],
    }));
  }

  function handleSubmit(): void {
    setError(null);
    startTransition(async () => {
      const result = mode === "create" ? await createClient(payload) : await updateClient(client!.id, payload);
      if (result && "error" in result) setError(result.error);
    });
  }

  const isIndividual = payload.kind === "individual";

  return (
    <div className="inline-form">
      <section className="form-section form-section--first">
        <h2>Tipo de cadastro</h2>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Tipo</span>
            <select value={payload.kind} onChange={(e) => set("kind", e.target.value as ClientFormPayload["kind"])} disabled={mode === "edit"}>
              <option value="individual">Pessoa física</option>
              <option value="company">Pessoa jurídica</option>
            </select>
          </label>
          <label className="form-field">
            <span className="field-label">Status</span>
            <select value={payload.status} onChange={(e) => set("status", e.target.value as ClientFormPayload["status"])}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </label>
        </div>
      </section>

      {isIndividual ? (
        <section className="form-section">
          <h2>Identificação</h2>
          <div className="form-grid">
            <label className="form-field">
              <span className="field-label">Nome completo</span>
              <input type="text" value={payload.fullName} onChange={(e) => set("fullName", e.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">CPF <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.cpf} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" />
            </label>
            <label className="form-field">
              <span className="field-label">Data de nascimento <span className="field-optional">(opcional)</span></span>
              <input type="date" value={payload.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
            </label>
          </div>
        </section>
      ) : (
        <section className="form-section">
          <h2>Identificação</h2>
          <div className="form-grid">
            <label className="form-field">
              <span className="field-label">Razão social</span>
              <input type="text" value={payload.companyName} onChange={(e) => set("companyName", e.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">Nome fantasia <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.tradeName} onChange={(e) => set("tradeName", e.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">CNPJ <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.cnpj} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
            </label>
            <label className="form-field">
              <span className="field-label">Inscrição estadual <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.stateRegistration} onChange={(e) => set("stateRegistration", e.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">Nome do responsável <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.responsibleName} onChange={(e) => set("responsibleName", e.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">CPF do responsável <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.responsibleCpf} onChange={(e) => set("responsibleCpf", e.target.value)} placeholder="000.000.000-00" />
            </label>
          </div>
        </section>
      )}

      <section className="form-section">
        <h2>Contato</h2>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Telefone principal <span className="field-optional">(opcional)</span></span>
            <input type="text" value={payload.phonePrimary} onChange={(e) => set("phonePrimary", e.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Telefone secundário <span className="field-optional">(opcional)</span></span>
            <input type="text" value={payload.phoneSecondary} onChange={(e) => set("phoneSecondary", e.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">WhatsApp <span className="field-optional">(opcional)</span></span>
            <input type="text" value={payload.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">E-mail <span className="field-optional">(opcional)</span></span>
            <input type="email" value={payload.email} onChange={(e) => set("email", e.target.value)} />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Endereço</h2>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">CEP <span className="field-optional">(opcional)</span></span>
            <input type="text" value={payload.addressZip} onChange={(e) => set("addressZip", e.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Logradouro <span className="field-optional">(opcional)</span></span>
            <input type="text" value={payload.addressStreet} onChange={(e) => set("addressStreet", e.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Número <span className="field-optional">(opcional)</span></span>
            <input type="text" value={payload.addressNumber} onChange={(e) => set("addressNumber", e.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Complemento <span className="field-optional">(opcional)</span></span>
            <input type="text" value={payload.addressComplement} onChange={(e) => set("addressComplement", e.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Bairro <span className="field-optional">(opcional)</span></span>
            <input type="text" value={payload.addressNeighborhood} onChange={(e) => set("addressNeighborhood", e.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Cidade <span className="field-optional">(opcional)</span></span>
            <input type="text" value={payload.addressCity} onChange={(e) => set("addressCity", e.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">UF <span className="field-optional">(opcional)</span></span>
            <input type="text" maxLength={2} value={payload.addressState} onChange={(e) => set("addressState", e.target.value.toUpperCase())} />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Papéis</h2>
        <p className="helper-text">O mesmo cadastro pode acumular mais de um papel (ex.: cliente e assinante ao mesmo tempo).</p>
        <div className="form-grid">
          {CLIENT_ROLES.map((role) => (
            <label key={role} className="form-field" style={{ flexDirection: "row", alignItems: "center", gap: "8px" }}>
              <input type="checkbox" checked={payload.roles.includes(role)} onChange={() => toggleRole(role)} />
              <span className="field-label" style={{ margin: 0 }}>{CLIENT_ROLE_LABELS[role]}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="form-section">
        <h2>Observações</h2>
        <label className="form-field">
          <span className="field-label">Observações <span className="field-optional">(opcional)</span></span>
          <textarea rows={4} value={payload.notes} onChange={(e) => set("notes", e.target.value)} />
        </label>
      </section>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="form-actions">
        <button type="button" className="form-action-primary" onClick={handleSubmit} disabled={pending}>
          {pending ? "Salvando…" : mode === "create" ? "Criar cliente" : "Salvar alterações"}
        </button>
        <button type="button" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
