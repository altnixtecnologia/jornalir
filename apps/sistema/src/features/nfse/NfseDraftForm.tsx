"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Client, NfseDraft, NfseServiceProfile } from "@ir/types";
import { buildFiscalSnapshotFromServiceProfile, buildTomadorSnapshotFromClient, clientDisplayName, listSelectableServiceProfiles } from "@ir/types";
import { validateNfseDraft } from "@ir/core";
import {
  createDraftAction,
  refreshTomadorSnapshotAction,
  updateDraftAction,
  type DraftFormInput,
  type FiscalSnapshotFormInput,
  type TomadorSnapshotFormInput,
} from "../../app/sistema/nfse/nova/actions";

function emptyTomador(): TomadorSnapshotFormInput {
  return {
    kind: "individual",
    name: "",
    cpf: "",
    cnpj: "",
    municipalRegistration: "",
    stateRegistration: "",
    zip: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    ibgeCode: "",
    email: "",
    phone: "",
  };
}

function emptyFiscal(): FiscalSnapshotFormInput {
  return { cTribNac: "", cTribMun: "", cNBS: "", issqnTaxation: "", specialTaxRegime: "", locationMunicipality: "", locationIbgeCode: "" };
}

function draftToInput(draft: NfseDraft): DraftFormInput {
  return {
    clientId: draft.clientId,
    tomador: {
      kind: draft.tomador.kind,
      name: draft.tomador.name,
      cpf: draft.tomador.cpf ?? "",
      cnpj: draft.tomador.cnpj ?? "",
      municipalRegistration: draft.tomador.municipalRegistration ?? "",
      stateRegistration: draft.tomador.stateRegistration ?? "",
      zip: draft.tomador.zip ?? "",
      street: draft.tomador.street ?? "",
      number: draft.tomador.number ?? "",
      complement: draft.tomador.complement ?? "",
      neighborhood: draft.tomador.neighborhood ?? "",
      city: draft.tomador.city ?? "",
      state: draft.tomador.state ?? "",
      ibgeCode: draft.tomador.ibgeCode ?? "",
      email: draft.tomador.email ?? "",
      phone: draft.tomador.phone ?? "",
    },
    serviceProfileId: draft.serviceProfileId ?? "",
    fiscal: {
      cTribNac: draft.fiscal.cTribNac ?? "",
      cTribMun: draft.fiscal.cTribMun ?? "",
      cNBS: draft.fiscal.cNBS ?? "",
      issqnTaxation: draft.fiscal.issqnTaxation ?? "",
      specialTaxRegime: draft.fiscal.specialTaxRegime ?? "",
      locationMunicipality: draft.fiscal.locationMunicipality ?? "",
      locationIbgeCode: draft.fiscal.locationIbgeCode ?? "",
    },
    competencyDate: draft.competencyDate,
    serviceValue: String(draft.serviceValue),
    serviceDescription: draft.serviceDescription,
    notes: draft.notes ?? "",
  };
}

/**
 * Nova NFS-e / edição de rascunho (Parte 1, item 8) — uma única
 * página em seções (Tomador/Serviço/Valores/Tributação/Descrição/
 * Revisão), nunca um wizard longo. NUNCA existe um botão funcional de
 * "Transmitir" — isso só chega na Parte 2, com integração real.
 */
export function NfseDraftForm({
  mode,
  clients,
  serviceProfiles,
  issuerConfigured,
  initialDraft,
}: {
  mode: "create" | "edit";
  clients: Client[];
  serviceProfiles: NfseServiceProfile[];
  issuerConfigured: boolean;
  initialDraft?: NfseDraft;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const [clientId, setClientId] = useState(initialDraft?.clientId ?? "");
  const [tomador, setTomador] = useState<TomadorSnapshotFormInput>(initialDraft ? draftToInput(initialDraft).tomador : emptyTomador());
  const [serviceProfileId, setServiceProfileId] = useState(initialDraft?.serviceProfileId ?? "");
  const [fiscal, setFiscal] = useState<FiscalSnapshotFormInput>(initialDraft ? draftToInput(initialDraft).fiscal : emptyFiscal());
  const [competencyDate, setCompetencyDate] = useState(initialDraft?.competencyDate ?? new Date().toISOString().slice(0, 10));
  const [serviceValue, setServiceValue] = useState(initialDraft ? String(initialDraft.serviceValue) : "");
  const [serviceDescription, setServiceDescription] = useState(initialDraft?.serviceDescription ?? "");
  const [notes, setNotes] = useState(initialDraft?.notes ?? "");

  const selectableProfiles = useMemo(() => listSelectableServiceProfiles(serviceProfiles), [serviceProfiles]);

  function handleSelectClient(id: string): void {
    setClientId(id);
    setRefreshMessage(null);
    const client = clients.find((item) => item.id === id);
    if (client) setTomador(() => {
      const snapshot = buildTomadorSnapshotFromClient(client, clientDisplayName(client));
      return {
        kind: snapshot.kind,
        name: snapshot.name,
        cpf: snapshot.cpf ?? "",
        cnpj: snapshot.cnpj ?? "",
        municipalRegistration: snapshot.municipalRegistration ?? "",
        stateRegistration: snapshot.stateRegistration ?? "",
        zip: snapshot.zip ?? "",
        street: snapshot.street ?? "",
        number: snapshot.number ?? "",
        complement: snapshot.complement ?? "",
        neighborhood: snapshot.neighborhood ?? "",
        city: snapshot.city ?? "",
        state: snapshot.state ?? "",
        ibgeCode: snapshot.ibgeCode ?? "",
        email: snapshot.email ?? "",
        phone: snapshot.phone ?? "",
      };
    });
  }

  /** "Atualizar dados do cliente" (ajuste pós-revisão, item 1) — recarrega o
   * snapshot do cadastro mestre AGORA, sob ação explícita. Nunca escreve de
   * volta em `clients`; pra corrigir o cadastro, use "Editar cliente". */
  function handleRefreshFromClient(): void {
    if (!clientId) return;
    setError(null);
    setRefreshMessage(null);
    startTransition(async () => {
      const result = await refreshTomadorSnapshotAction(clientId, initialDraft?.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setTomador(result.tomador);
      setRefreshMessage("Dados do tomador atualizados a partir do cadastro do cliente.");
    });
  }

  function handleSelectServiceProfile(id: string): void {
    setServiceProfileId(id);
    const profile = serviceProfiles.find((item) => item.id === id);
    if (profile) {
      const snapshot = buildFiscalSnapshotFromServiceProfile(profile);
      setFiscal({
        cTribNac: snapshot.cTribNac ?? "",
        cTribMun: snapshot.cTribMun ?? "",
        cNBS: snapshot.cNBS ?? "",
        issqnTaxation: snapshot.issqnTaxation ?? "",
        specialTaxRegime: snapshot.specialTaxRegime ?? "",
        locationMunicipality: snapshot.locationMunicipality ?? "",
        locationIbgeCode: snapshot.locationIbgeCode ?? "",
      });
    }
  }

  function setFiscalField<K extends keyof FiscalSnapshotFormInput>(key: K, value: FiscalSnapshotFormInput[K]): void {
    setFiscal((prev) => ({ ...prev, [key]: value }));
  }

  const validation = validateNfseDraft({
    clientId: clientId || undefined,
    tomadorKind: tomador.kind,
    tomadorName: tomador.name,
    tomadorCpf: tomador.cpf,
    tomadorCnpj: tomador.cnpj,
    tomadorCity: tomador.city,
    tomadorState: tomador.state,
    serviceProfileId: serviceProfileId || undefined,
    cTribNac: fiscal.cTribNac,
    competencyDate,
    serviceValue: Number(serviceValue.replace(",", ".")),
    serviceDescription,
    issuerConfigured,
  });

  function buildInput(): DraftFormInput {
    return { clientId, tomador, serviceProfileId, fiscal, competencyDate, serviceValue, serviceDescription, notes };
  }

  function handleSave(): void {
    setError(null);
    startTransition(async () => {
      if (mode === "create") {
        const result = await createDraftAction(buildInput());
        if ("error" in result) {
          setError(result.error);
          return;
        }
        router.push(`/sistema/nfse/rascunhos/${result.draftId}`);
      } else if (initialDraft) {
        const result = await updateDraftAction(initialDraft.id, buildInput());
        if (result && "error" in result) setError(result.error);
      }
    });
  }

  return (
    <div className="inline-form">
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <section className="form-section form-section--first">
        <h2>Tomador</h2>
        <div className="form-grid">
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Cliente</span>
            <select value={clientId} onChange={(event) => handleSelectClient(event.target.value)}>
              <option value="">Selecione um cliente</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {clientDisplayName(client)} ({client.reference})
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="helper-text">
          Cliente ainda não cadastrado?{" "}
          <Link className="materia-title-link" href="/sistema/clientes/novo">
            Cadastrar novo cliente
          </Link>
          .
        </p>

        {clientId ? (
          <>
            <p className="helper-text">
              Dados do cadastro — <strong>somente leitura</strong> nesta tela. Os dados do cliente não podem ser editados aqui; corrija no cadastro de Clientes e depois use "Atualizar dados do cliente".
            </p>
            <div className="form-grid">
              <div className="form-field" style={{ gridColumn: "1 / -1" }}>
                <span className="field-label">Nome/razão social</span>
                <span>{tomador.name || "—"}</span>
              </div>
              <div className="form-field">
                <span className="field-label">{tomador.kind === "individual" ? "CPF" : "CNPJ"}</span>
                <span>{(tomador.kind === "individual" ? tomador.cpf : tomador.cnpj) || "—"}</span>
              </div>
              <div className="form-field">
                <span className="field-label">Inscrição municipal</span>
                <span>{tomador.municipalRegistration || "—"}</span>
              </div>
              <div className="form-field">
                <span className="field-label">Inscrição estadual</span>
                <span>{tomador.stateRegistration || "—"}</span>
              </div>
              <div className="form-field">
                <span className="field-label">Endereço</span>
                <span>
                  {[tomador.street, tomador.number, tomador.complement].filter(Boolean).join(", ") || "—"}
                  {tomador.neighborhood ? ` — ${tomador.neighborhood}` : ""}
                </span>
              </div>
              <div className="form-field">
                <span className="field-label">Município/UF</span>
                <span>{[tomador.city, tomador.state].filter(Boolean).join("/") || "—"}</span>
              </div>
              <div className="form-field">
                <span className="field-label">CEP</span>
                <span>{tomador.zip || "—"}</span>
              </div>
              <div className="form-field">
                <span className="field-label">Código do município (IBGE)</span>
                <span>{tomador.ibgeCode || "—"}</span>
              </div>
              <div className="form-field">
                <span className="field-label">E-mail</span>
                <span>{tomador.email || "—"}</span>
              </div>
              <div className="form-field">
                <span className="field-label">Telefone</span>
                <span>{tomador.phone || "—"}</span>
              </div>
            </div>
            <div className="form-actions">
              <Link className="secondary-link" href={`/sistema/clientes/${clientId}/editar`} target="_blank">
                Editar cliente
              </Link>
              <button type="button" onClick={handleRefreshFromClient} disabled={pending}>
                Atualizar dados do cliente
              </button>
            </div>
            {refreshMessage ? <p className="helper-text">{refreshMessage}</p> : null}
          </>
        ) : null}
      </section>

      <section className="form-section">
        <h2>Serviço</h2>
        <div className="form-grid">
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Perfil de serviço</span>
            <select value={serviceProfileId} onChange={(event) => handleSelectServiceProfile(event.target.value)}>
              <option value="">Nenhum (preencher manualmente)</option>
              {selectableProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Valores</h2>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Competência</span>
            <input type="date" value={competencyDate} onChange={(event) => setCompetencyDate(event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Valor do serviço (R$)</span>
            <input type="text" inputMode="decimal" value={serviceValue} onChange={(event) => setServiceValue(event.target.value)} placeholder="0,00" />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Tributação/configuração fiscal</h2>
        <p className="helper-text">Carregada do perfil de serviço escolhido — editável só para esta NFS-e.</p>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Código de tributação nacional (cTribNac)</span>
            <input type="text" value={fiscal.cTribNac} onChange={(event) => setFiscalField("cTribNac", event.target.value)} />
            <span className="helper-text">Usado pelo padrão nacional da NFS-e.</span>
          </label>
          <label className="form-field">
            <span className="field-label">Código de tributação municipal (cTribMun) <span className="field-optional">(opcional)</span></span>
            <input type="text" value={fiscal.cTribMun} onChange={(event) => setFiscalField("cTribMun", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">NBS (cNBS) <span className="field-optional">(opcional)</span></span>
            <input type="text" value={fiscal.cNBS} onChange={(event) => setFiscalField("cNBS", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Tributação do ISSQN <span className="field-optional">(opcional)</span></span>
            <input type="text" value={fiscal.issqnTaxation} onChange={(event) => setFiscalField("issqnTaxation", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Regime especial <span className="field-optional">(opcional)</span></span>
            <input type="text" value={fiscal.specialTaxRegime} onChange={(event) => setFiscalField("specialTaxRegime", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Município da prestação <span className="field-optional">(opcional)</span></span>
            <input type="text" value={fiscal.locationMunicipality} onChange={(event) => setFiscalField("locationMunicipality", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Código IBGE da prestação <span className="field-optional">(opcional)</span></span>
            <input type="text" value={fiscal.locationIbgeCode} onChange={(event) => setFiscalField("locationIbgeCode", event.target.value)} />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Descrição</h2>
        <div className="form-grid">
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Descrição do serviço</span>
            <textarea rows={3} value={serviceDescription} onChange={(event) => setServiceDescription(event.target.value)} />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Observações internas <span className="field-optional">(opcional)</span></span>
            <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Revisão</h2>
        {validation.readyForFutureTransmission ? (
          <p className="helper-text">Rascunho completo — pronto para uma futura transmissão (quando a Parte 2 existir). Isto NÃO é uma validação fiscal perante a Receita/Governo.</p>
        ) : (
          <div className="form-error" role="alert">
            <p>Rascunho incompleto — faltam:</p>
            <ul>
              {validation.missingFields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="form-action-primary" onClick={handleSave} disabled={pending}>
            {pending ? "Salvando…" : "Salvar rascunho"}
          </button>
        </div>
        <p className="helper-text">Transmissão para o Sistema Nacional ainda não está habilitada — esta NFS-e continua sendo só um rascunho.</p>
      </section>
    </div>
  );
}
