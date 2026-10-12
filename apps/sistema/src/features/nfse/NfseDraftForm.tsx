"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NfseDraft, NfseIssuerConfig, NfseServiceProfile } from "@ir/types";
import { NFSE_CATVSN_CODES, NFSE_CATVSN_LABELS, buildFiscalSnapshotFromServiceProfile, listSelectableServiceProfiles } from "@ir/types";
import { validateNfseDraft } from "@ir/core";
import {
  createDraftAction,
  refreshTomadorSnapshotAction,
  updateDraftAction,
  type DraftFormInput,
  type FiscalSnapshotFormInput,
  type TomadorSnapshotFormInput,
} from "../../app/sistema/nfse/nova/actions";
import { ClientPicker } from "../../components/admin/ClientPicker";
import type { ClientSearchResult } from "../../components/admin/clientSearchTypes";
import { Tabs, type TabItem } from "../../components/admin/Tabs";

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

/** Em modo "create", os 3 campos `issuer*` nascem já preenchidos com a
 * configuração ATUAL do prestador (snapshot no momento da criação) —
 * nunca ficam vazios à espera de um perfil de serviço, porque não têm
 * nenhuma relação com o perfil (são do prestador, não da operação). */
function emptyFiscal(issuerConfig?: NfseIssuerConfig | null): FiscalSnapshotFormInput {
  return {
    cTribNac: "",
    cTribMun: "",
    cNBS: "",
    issqnTaxation: "",
    specialTaxRegime: "",
    locationMunicipality: "",
    locationIbgeCode: "",
    cAtvSN: "",
    cstIbsCbs: "",
    cClassTrib: "",
    cIndOp: "",
    issuerSimplesNacionalOption: issuerConfig?.simplesNacionalOption ?? "",
    issuerIbsCbsSimplesNacionalRegime: issuerConfig?.ibsCbsSimplesNacionalRegime ?? "",
    issuerSpecialTaxRegimeCode: issuerConfig?.specialTaxRegimeCode ?? "",
  };
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
      cAtvSN: draft.fiscal.cAtvSN ?? "",
      cstIbsCbs: draft.fiscal.cstIbsCbs ?? "",
      cClassTrib: draft.fiscal.cClassTrib ?? "",
      cIndOp: draft.fiscal.cIndOp ?? "",
      // Preserva EXATAMENTE o que foi snapshotado na criação — nunca
      // recarrega da configuração atual do prestador ao editar (mesmo
      // princípio do snapshot do tomador: editar depois nunca reflete
      // mudanças retroativas na configuração do prestador).
      issuerSimplesNacionalOption: draft.fiscal.issuerSimplesNacionalOption ?? "",
      issuerIbsCbsSimplesNacionalRegime: draft.fiscal.issuerIbsCbsSimplesNacionalRegime ?? "",
      issuerSpecialTaxRegimeCode: draft.fiscal.issuerSpecialTaxRegimeCode ?? "",
    },
    competencyDate: draft.competencyDate,
    serviceValue: String(draft.serviceValue),
    serviceDescription: draft.serviceDescription,
    notes: draft.notes ?? "",
  };
}

/**
 * Nova NFS-e / edição de rascunho — organizada em ABAS reais (Dados da
 * nota / Tomador / Serviço e tributação / Revisão), não mais uma única
 * página longa em seções soltas: esta tela tem grupos de informação
 * genuinamente independentes, o caso exato em que abas fazem sentido
 * (ver Tabs). Todas as abas ficam montadas o tempo todo — trocar de aba
 * nunca perde o que já foi digitado. "Transmitir" nunca aparece aqui —
 * isso é só no detalhe do rascunho já salvo (NfseTransmissionPanel).
 *
 * Seletor de Cadastro único (ClientPicker) — nunca mais "Buscar cliente" +
 * "Cliente" nem a lista inteira de clientes carregada na página; ao
 * selecionar, busca o snapshot fiscal completo via Server Action
 * (refreshTomadorSnapshotAction, já existente — mesma função usada por
 * "Atualizar dados do cliente").
 */
export function NfseDraftForm({
  mode,
  serviceProfiles,
  issuerConfigured,
  issuerConfig,
  initialDraft,
  initialSelectedClient,
}: {
  mode: "create" | "edit";
  serviceProfiles: NfseServiceProfile[];
  issuerConfigured: boolean;
  /** Configuração ATUAL do prestador — usada só pra semear os campos `issuer*` de um rascunho NOVO (ver emptyFiscal). Nunca aplicada retroativamente a um rascunho já existente. */
  issuerConfig?: NfseIssuerConfig | null;
  initialDraft?: NfseDraft;
  initialSelectedClient?: ClientSearchResult | null;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(initialSelectedClient ?? null);
  const [tomador, setTomador] = useState<TomadorSnapshotFormInput>(initialDraft ? draftToInput(initialDraft).tomador : emptyTomador());
  const [serviceProfileId, setServiceProfileId] = useState(initialDraft?.serviceProfileId ?? "");
  const [fiscal, setFiscal] = useState<FiscalSnapshotFormInput>(initialDraft ? draftToInput(initialDraft).fiscal : emptyFiscal(issuerConfig));
  const [competencyDate, setCompetencyDate] = useState(initialDraft?.competencyDate ?? new Date().toISOString().slice(0, 10));
  const [serviceValue, setServiceValue] = useState(initialDraft ? String(initialDraft.serviceValue) : "");
  const [serviceDescription, setServiceDescription] = useState(initialDraft?.serviceDescription ?? "");
  const [notes, setNotes] = useState(initialDraft?.notes ?? "");

  const clientId = selectedClient?.id ?? "";
  const selectableProfiles = useMemo(() => listSelectableServiceProfiles(serviceProfiles), [serviceProfiles]);

  function applySnapshot(result: { error: string } | { ok: true; tomador: TomadorSnapshotFormInput }, successMessage?: string): void {
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setTomador(result.tomador);
    if (successMessage) setRefreshMessage(successMessage);
  }

  function handleSelectClient(client: ClientSearchResult | null): void {
    setSelectedClient(client);
    setError(null);
    setRefreshMessage(null);
    if (!client) {
      setTomador(emptyTomador());
      return;
    }
    startTransition(async () => {
      applySnapshot(await refreshTomadorSnapshotAction(client.id));
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
      applySnapshot(await refreshTomadorSnapshotAction(clientId, initialDraft?.id), "Dados do tomador atualizados a partir do cadastro do cliente.");
    });
  }

  function handleSelectServiceProfile(id: string): void {
    setServiceProfileId(id);
    const profile = serviceProfiles.find((item) => item.id === id);
    if (profile) {
      // Perfil traz os campos da OPERAÇÃO (cTribNac/cAtvSN/CST/
      // cClassTrib/cIndOp); os 3 campos issuer* vêm sempre da
      // configuração do prestador, nunca do perfil — por isso
      // `fiscal.issuer*` atual é preservado aqui, nunca sobrescrito ao
      // trocar de perfil.
      const snapshot = buildFiscalSnapshotFromServiceProfile(profile, issuerConfig ?? undefined);
      setFiscal((prev) => ({
        ...prev,
        cTribNac: snapshot.cTribNac ?? "",
        cTribMun: snapshot.cTribMun ?? "",
        cNBS: snapshot.cNBS ?? "",
        issqnTaxation: snapshot.issqnTaxation ?? "",
        specialTaxRegime: snapshot.specialTaxRegime ?? "",
        locationMunicipality: snapshot.locationMunicipality ?? "",
        locationIbgeCode: snapshot.locationIbgeCode ?? "",
        cAtvSN: snapshot.cAtvSN ?? "",
        cstIbsCbs: snapshot.cstIbsCbs ?? "",
        cClassTrib: snapshot.cClassTrib ?? "",
        cIndOp: snapshot.cIndOp ?? "",
      }));
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

  const emailSourceHint = selectedClient
    ? tomador.email
      ? "e-mail fiscal do cadastro (ou e-mail principal, quando não há e-mail fiscal cadastrado)"
      : "cadastro sem e-mail"
    : undefined;

  const tabs: TabItem[] = [
    {
      id: "dados",
      label: "Dados da nota",
      content: (
        <>
          <section className="form-section form-section--first">
            <h2>Valores</h2>
            <div className="form-grid">
              <label className="form-field">
                <span className="field-label">Competência</span>
                <input type="date" value={competencyDate} onChange={(event) => setCompetencyDate(event.target.value)} />
                <span className="helper-text">Sempre explícita — nunca derivada silenciosamente; a data atual é só sugestão inicial.</span>
              </label>
              <label className="form-field">
                <span className="field-label">Valor do serviço (R$)</span>
                <input type="text" inputMode="decimal" value={serviceValue} onChange={(event) => setServiceValue(event.target.value)} placeholder="0,00" />
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
        </>
      ),
    },
    {
      id: "tomador",
      label: "Tomador",
      content: (
        <section className="form-section form-section--first">
          <h2>Tomador</h2>
          <div className="form-grid">
            <div className="form-field" style={{ gridColumn: "1 / -1" }}>
              <ClientPicker selected={selectedClient} onSelect={handleSelectClient} />
            </div>
          </div>
          <p className="helper-text">
            Cliente ainda não cadastrado?{" "}
            <Link className="materia-title-link" href="/sistema/clientes/novo">
              Cadastrar novo cliente
            </Link>
            .
          </p>

          {selectedClient ? (
            <>
              <p className="helper-text">
                Snapshot fiscal da nota — <strong>somente leitura</strong> aqui. Estes dados não mudam se o Cadastro for editado depois; use "Atualizar
                dados do cliente" para recarregar explicitamente.
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
                  <span className="field-label">E-mail fiscal da nota</span>
                  <span>{tomador.email || "—"}</span>
                  {emailSourceHint ? <span className="helper-text">{emailSourceHint}</span> : null}
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
      ),
    },
    {
      id: "servico",
      label: "Serviço e tributação",
      content: (
        <>
          <section className="form-section form-section--first">
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
            <h2>Tributação/configuração fiscal</h2>
            <p className="helper-text">Carregada do perfil de serviço escolhido — editável só para esta NFS-e. Nenhum valor é presumido pela aplicação.</p>
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
              <label className="form-field">
                <span className="field-label">Código de atividade do Simples Nacional (cAtvSN) <span className="field-optional">(opcional)</span></span>
                <select value={fiscal.cAtvSN} onChange={(event) => setFiscalField("cAtvSN", event.target.value)}>
                  <option value="">Não escolhido</option>
                  {NFSE_CATVSN_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code} — {NFSE_CATVSN_LABELS[code]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span className="field-label">CST IBS/CBS <span className="field-optional">(opcional)</span></span>
                <input type="text" value={fiscal.cstIbsCbs} onChange={(event) => setFiscalField("cstIbsCbs", event.target.value)} />
              </label>
              <label className="form-field">
                <span className="field-label">Classificação tributária (cClassTrib) <span className="field-optional">(opcional)</span></span>
                <input type="text" value={fiscal.cClassTrib} onChange={(event) => setFiscalField("cClassTrib", event.target.value)} />
              </label>
              <label className="form-field">
                <span className="field-label">Indicador de operação (cIndOp) <span className="field-optional">(opcional)</span></span>
                <input type="text" value={fiscal.cIndOp} onChange={(event) => setFiscalField("cIndOp", event.target.value)} />
                <span className="helper-text">Carregado do perfil como padrão — pode ser ajustado só para esta operação.</span>
              </label>
            </div>
          </section>
          <section className="form-section">
            <h2>Situação fiscal do prestador (snapshot)</h2>
            <p className="helper-text">
              Copiados da configuração do prestador no momento da criação deste rascunho — nunca editáveis aqui diretamente; pra corrigir, ajuste a configuração fiscal do prestador antes de criar um novo rascunho.
            </p>
            <div className="form-grid">
              <label className="form-field">
                <span className="field-label">Situação no Simples Nacional</span>
                <input type="text" value={fiscal.issuerSimplesNacionalOption || "—"} disabled readOnly />
              </label>
              <label className="form-field">
                <span className="field-label">Regime de apuração IBS/CBS no Simples</span>
                <input type="text" value={fiscal.issuerIbsCbsSimplesNacionalRegime || "—"} disabled readOnly />
              </label>
              <label className="form-field">
                <span className="field-label">Regime especial de tributação</span>
                <input type="text" value={fiscal.issuerSpecialTaxRegimeCode || "—"} disabled readOnly />
              </label>
            </div>
          </section>
        </>
      ),
    },
    {
      id: "revisao",
      label: "Revisão",
      content: (
        <section className="form-section form-section--first">
          <h2>Revisão</h2>
          {validation.readyForFutureTransmission ? (
            <p className="helper-text">Rascunho completo — pronto para transmissão (na página do rascunho, depois de salvo). Isto NÃO é uma validação fiscal perante a Receita/Governo.</p>
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
          <p className="helper-text">A transmissão para o Sistema Nacional acontece na página do rascunho já salvo, nunca aqui.</p>
        </section>
      ),
    },
  ];

  return (
    <div className="inline-form">
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <Tabs tabs={tabs} />
    </div>
  );
}
