"use client";

import { useEffect, useState, useTransition, type JSX } from "react";
import { useRouter } from "next/navigation";
import type { Client, ClientRole } from "@ir/types";
import { CLIENT_ROLES, CLIENT_ROLE_LABELS } from "@ir/types";
import { createClient, updateClient } from "../../app/sistema/clientes/actions";
import type { ClientFormPayload } from "./clientFormTypes";
import { PhoneField } from "./PhoneField";
import { Tabs, type TabItem } from "../../components/admin/Tabs";
import { lookupCep } from "../../lib/cep";
import {
  findBirthdayCandidates, linkBirthdayEntryToClient,
} from "../../app/sistema/aniversariantes/actions";
import type { BirthdayCandidate } from "../../app/sistema/aniversariantes/actions";
import { notify } from "../../lib/feedback/notify";

/** Busca+vinculação de aniversariantes já existentes (ver aba "Família e
 * aniversários") — pedido explícito do usuário em 17/10/2026, para
 * aproveitar uma lista grande de aniversariantes sem duplicar o cadastro de
 * clientes. Nunca vincula sozinho: só sugere candidatos para confirmação. */
function BirthdayCandidateSearch({
  clientId, fullName, birthDate, city,
}: { clientId: string; fullName: string; birthDate: string; city: string }): JSX.Element {
  const router = useRouter();
  const [candidates, setCandidates] = useState<BirthdayCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function search(): void {
    if (!fullName.trim() || !birthDate) {
      setMessage("Informe nome completo e nascimento antes de buscar.");
      return;
    }
    setSearching(true); setMessage(null);
    void findBirthdayCandidates(fullName, birthDate, city).then((result) => {
      if ("error" in result) { setMessage(result.error); return; }
      setCandidates(result.data);
      if (result.data.length === 0) setMessage("Nenhum aniversariante existente parece corresponder a esta pessoa.");
    }).catch(() => setMessage("Não foi possível buscar aniversariantes existentes."))
      .finally(() => setSearching(false));
  }

  function link(candidateId: string): void {
    setLinkingId(candidateId);
    void linkBirthdayEntryToClient(candidateId, clientId).then((result) => {
      if ("error" in result) { notify.error("Não foi possível vincular", result.error); return; }
      setCandidates((prev) => prev?.filter((c) => c.id !== candidateId) ?? null);
      notify.success("Aniversariante vinculado", "Vinculado ao cadastro mestre, preservando dados editoriais, fotos e histórico de mensagens.");
      router.refresh();
    }).catch(() => notify.error("Não foi possível vincular", "Não foi possível concluir a vinculação."))
      .finally(() => setLinkingId(null));
  }

  return (
    <div>
      <button type="button" className="cadastros-btn-secondary" disabled={searching} onClick={search}>
        {searching ? "Buscando…" : "Buscar aniversariantes existentes"}
      </button>
      {message ? <p className="helper-text">{message}</p> : null}
      {candidates && candidates.length > 0 ? (
        <ul className="cadastro-family-tree">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              {candidate.displayName}
              {candidate.relationship ? ` — ${candidate.relationship}` : ""}
              {" — "}{new Date(`${candidate.birthDate}T00:00:00`).toLocaleDateString("pt-BR")}
              {candidate.city ? ` — ${candidate.city}` : ""}
              {" "}
              <button type="button" className="cadastros-btn-secondary" disabled={linkingId === candidate.id}
                onClick={() => link(candidate.id)}>
                {linkingId === candidate.id ? "Vinculando…" : "Vincular a este cadastro"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function payloadFromClient(client?: Client): ClientFormPayload {
  return {
    kind: client?.kind ?? "individual",
    status: client?.status ?? "active",
    fullName: client?.fullName ?? "",
    cpf: client?.cpf ?? "",
    birthDate: client?.birthDate ?? "",
    companyName: client?.companyName ?? "",
    tradeName: client?.tradeName ?? "",
    foundingDate: client?.foundingDate ?? "",
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
 * Cadastro central de clientes, organizado em abas (Dados gerais/Fiscal/
 * Família e aniversários/Anexos/Observações) — padrão reutilizável
 * (`Tabs`), aplicado SOMENTE aqui por enquanto. Todas as abas ficam
 * montadas o tempo todo (ver Tabs.tsx): trocar de aba nunca perde valor
 * digitado, porque o estado de verdade é este `payload` único, nunca algo
 * local de cada aba.
 */
export function ClientForm({ mode, client }: ClientFormProps): JSX.Element {
  const router = useRouter();
  const [payload, setPayload] = useState<ClientFormPayload>(() => payloadFromClient(client));
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "error">("idle");
  const [cepIbge, setCepIbge] = useState<string>("");

  // Aba Família e aniversários — demonstração local apenas. Aniversariantes
  // é uma base editorial SEPARADA de `clients` (decisão confirmada): nada
  // aqui é enviado em `payload`/`createClient`/`updateClient`, nunca é
  // gravado. A lista real vive em /sistema/aniversariantes.
  const [familyMembers, setFamilyMembers] = useState<
    Array<{ id: string; name: string; relationship: string; birthDate: string; city: string }>
  >([]);
  const [familyFormOpen, setFamilyFormOpen] = useState(false);
  const [familyDraft, setFamilyDraft] = useState({ name: "", relationship: "", birthDate: "", city: "" });

  function addFamilyMember(): void {
    if (!familyDraft.name.trim() || !familyDraft.birthDate) return;
    setFamilyMembers((prev) => [...prev, { id: `local-${Date.now()}`, ...familyDraft }]);
    setFamilyDraft({ name: "", relationship: "", birthDate: "", city: "" });
    setFamilyFormOpen(false);
  }

  function set<K extends keyof ClientFormPayload>(key: K, value: ClientFormPayload[K]): void {
    setPayload((prev) => ({ ...prev, [key]: value }));
  }

  function toggleRole(role: ClientRole): void {
    setPayload((prev) => ({
      ...prev,
      roles: prev.roles.includes(role) ? prev.roles.filter((r) => r !== role) : [...prev.roles, role],
    }));
    setRolesError(null);
  }

  // Busca de CEP (ViaCEP) — só dispara com os 8 dígitos completos, nunca a
  // cada tecla. Preenche logradouro/bairro/cidade/UF (todos continuam
  // editáveis) e guarda o código IBGE só em memória: `clients` não tem
  // coluna para isso hoje (ver docs/cadastro mestre), nunca persistido.
  useEffect(() => {
    const digits = payload.addressZip.replace(/\D/g, "");
    if (digits.length !== 8) {
      setCepStatus("idle");
      return;
    }
    const controller = new AbortController();
    setCepStatus("loading");
    lookupCep(digits, controller.signal)
      .then((result) => {
        if (!result) {
          setCepStatus("error");
          return;
        }
        setCepStatus("idle");
        setCepIbge(result.ibgeCode);
        setPayload((prev) => ({
          ...prev,
          addressStreet: result.street || prev.addressStreet,
          addressNeighborhood: result.neighborhood || prev.addressNeighborhood,
          addressCity: result.city || prev.addressCity,
          addressState: result.state || prev.addressState,
        }));
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setCepStatus("error");
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage ao CEP; não precisa reagir a mais nada.
  }, [payload.addressZip]);

  function handleSubmit(): void {
    if (payload.roles.length === 0) {
      setRolesError("Selecione ao menos um papel.");
      return;
    }
    setRolesError(null);
    startTransition(async () => {
      const result = mode === "create" ? await createClient(payload) : await updateClient(client!.id, payload);
      if (result && "error" in result) notify.error("Não foi possível salvar o cadastro", result.error);
    });
  }

  const isIndividual = payload.kind === "individual";

  const dadosGeraisTab = (
    <>
      <div className="cadastro-top-row">
        <div className="cadastro-segmented" role="group" aria-label="Tipo de cadastro">
          <button
            type="button"
            className={`cadastro-segmented-btn${isIndividual ? " is-active" : ""}`}
            aria-pressed={isIndividual}
            disabled={mode === "edit"}
            onClick={() => set("kind", "individual")}
          >
            Pessoa física
          </button>
          <button
            type="button"
            className={`cadastro-segmented-btn${!isIndividual ? " is-active" : ""}`}
            aria-pressed={!isIndividual}
            disabled={mode === "edit"}
            onClick={() => set("kind", "company")}
          >
            Pessoa jurídica
          </button>
        </div>
        <div className="cadastro-status-inline">
          <span className="field-label">Status</span>
          <button
            type="button"
            role="switch"
            aria-checked={payload.status === "active"}
            className={`switch-control${payload.status === "active" ? " is-on" : ""}`}
            onClick={() => set("status", payload.status === "active" ? "inactive" : "active")}
          >
            <span className="switch-track" aria-hidden="true">
              <span className="switch-thumb" />
            </span>
            <span>{payload.status === "active" ? "Ativo" : "Inativo"}</span>
          </button>
        </div>
      </div>

      {isIndividual ? (
        <section className="form-section form-section--first">
          <h2>Identificação</h2>
          <div className="cadastro-grid">
            <label className="cadastro-field cadastro-field--span-7 cadastro-field--required">
              <span className="field-label">Nome completo</span>
              <input type="text" value={payload.fullName} onChange={(e) => set("fullName", e.target.value)} />
            </label>
            <label className="cadastro-field cadastro-field--span-3 cadastro-field--required">
              <span className="field-label">CPF</span>
              <input type="text" value={payload.cpf} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" />
            </label>
            <label className="cadastro-field cadastro-field--span-2">
              <span className="field-label">Nascimento <span className="field-optional">(opcional)</span></span>
              <span className="cadastro-date-compact">
                <input type="date" value={payload.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
                {payload.birthDate ? (
                  <button
                    type="button"
                    className="cadastro-date-clear"
                    onClick={() => set("birthDate", "")}
                    aria-label="Limpar data de nascimento"
                    title="Limpar data de nascimento"
                  >
                    ×
                  </button>
                ) : null}
              </span>
            </label>
          </div>
          <p className="helper-text">Usada futuramente pelo módulo de Aniversariantes (ver aba Família e aniversários).</p>
        </section>
      ) : (
        <section className="form-section form-section--first">
          <h2>Identificação</h2>
          <div className="cadastro-grid">
            <label className="cadastro-field cadastro-field--span-6 cadastro-field--required">
              <span className="field-label">Razão social</span>
              <input type="text" value={payload.companyName} onChange={(e) => set("companyName", e.target.value)} />
            </label>
            <label className="cadastro-field cadastro-field--span-3">
              <span className="field-label">Nome fantasia <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.tradeName} onChange={(e) => set("tradeName", e.target.value)} />
            </label>
            <label className="cadastro-field cadastro-field--span-3 cadastro-field--required">
              <span className="field-label">CNPJ</span>
              <input type="text" value={payload.cnpj} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
            </label>
            <label className="cadastro-field cadastro-field--span-2">
              <span className="field-label">Fundação <span className="field-optional">(opcional)</span></span>
              <span className="cadastro-date-compact">
                <input type="date" value={payload.foundingDate} onChange={(e) => set("foundingDate", e.target.value)} />
                {payload.foundingDate ? (
                  <button
                    type="button"
                    className="cadastro-date-clear"
                    onClick={() => set("foundingDate", "")}
                    aria-label="Limpar data de fundação"
                    title="Limpar data de fundação"
                  >
                    ×
                  </button>
                ) : null}
              </span>
            </label>
          </div>
          <p className="helper-text">Fundação é usada pelo módulo de Aniversariantes para destacar o aniversário de fundação da instituição. Inscrição estadual, responsável e dados fiscais ficam na aba Fiscal.</p>
        </section>
      )}

      <section className="form-section">
        <h2>Contato</h2>
        <div className="cadastro-grid">
          <label className="cadastro-field cadastro-field--span-2">
            <span className="field-label">Telefone principal <span className="field-optional">(opcional)</span></span>
            <PhoneField value={payload.phonePrimary} onChange={(v) => set("phonePrimary", v)} ariaLabel="Telefone principal, DDD e número" />
          </label>
          <label className="cadastro-field cadastro-field--span-2">
            <span className="field-label">Telefone secundário <span className="field-optional">(opcional)</span></span>
            <PhoneField value={payload.phoneSecondary} onChange={(v) => set("phoneSecondary", v)} ariaLabel="Telefone secundário, DDD e número" />
          </label>
          <label className="cadastro-field cadastro-field--span-2 cadastro-field--required">
            <span className="field-label">WhatsApp</span>
            <PhoneField value={payload.whatsapp} onChange={(v) => set("whatsapp", v)} ariaLabel="WhatsApp, DDD e número" />
          </label>
          {/* E-mail de contato: mesma linha dos telefones (telefones = span
              2 cada, 6 no total; e-mail = span 6 = o resto da linha de
              12). */}
          <label className="cadastro-field cadastro-field--span-6 cadastro-field--required">
            <span className="field-label">E-mail de contato</span>
            <input type="email" value={payload.email} onChange={(e) => set("email", e.target.value)} />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Endereço</h2>
        <div className="cadastro-grid">
          <label className="cadastro-field cadastro-field--span-2">
            <span className="field-label">CEP <span className="field-optional">(opcional)</span></span>
            <input
              type="text"
              value={payload.addressZip}
              onChange={(e) => set("addressZip", e.target.value)}
              placeholder="00000-000"
            />
          </label>
          <label className="cadastro-field cadastro-field--span-8">
            <span className="field-label">Logradouro <span className="field-optional">(opcional)</span></span>
            <input type="text" value={payload.addressStreet} onChange={(e) => set("addressStreet", e.target.value)} />
          </label>
          <label className="cadastro-field cadastro-field--span-2">
            <span className="field-label">Número <span className="field-optional">(opcional)</span></span>
            <input type="text" value={payload.addressNumber} onChange={(e) => set("addressNumber", e.target.value)} />
          </label>
          {cepStatus === "loading" ? <p className="cadastro-cep-hint cadastro-field--span-12">Buscando CEP...</p> : null}
          {cepStatus === "error" ? (
            <p className="cadastro-cep-hint cadastro-cep-hint--error cadastro-field--span-12">
              CEP não encontrado — preencha o endereço manualmente.
            </p>
          ) : null}
          {cepIbge ? (
            <p className="cadastro-cep-hint cadastro-field--span-12">
              Município IBGE: {cepIbge} (ainda não é salvo pelo cadastro mestre — ver aba Fiscal/relatório)
            </p>
          ) : null}
          <label className="cadastro-field cadastro-field--span-3">
            <span className="field-label">Complemento <span className="field-optional">(opcional)</span></span>
            <input type="text" value={payload.addressComplement} onChange={(e) => set("addressComplement", e.target.value)} />
          </label>
          <label className="cadastro-field cadastro-field--span-3">
            <span className="field-label">Bairro <span className="field-optional">(opcional)</span></span>
            <input type="text" value={payload.addressNeighborhood} onChange={(e) => set("addressNeighborhood", e.target.value)} />
          </label>
          <label className="cadastro-field cadastro-field--span-4">
            <span className="field-label">Cidade <span className="field-optional">(opcional)</span></span>
            <input type="text" value={payload.addressCity} onChange={(e) => set("addressCity", e.target.value)} />
          </label>
          <label className="cadastro-field cadastro-field--span-2">
            <span className="field-label">UF <span className="field-optional">(opcional)</span></span>
            <input type="text" maxLength={2} value={payload.addressState} onChange={(e) => set("addressState", e.target.value.toUpperCase())} />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Papéis</h2>
        <p className="helper-text">Pelo menos um papel é obrigatório (ex.: cliente, assinante).</p>
        <div className="cadastro-switches">
          {CLIENT_ROLES.map((role) => {
            const isOn = payload.roles.includes(role);
            return (
              <button
                key={role}
                type="button"
                role="switch"
                aria-checked={isOn}
                className={`switch-control${isOn ? " is-on" : ""}`}
                onClick={() => toggleRole(role)}
              >
                <span className="switch-track" aria-hidden="true">
                  <span className="switch-thumb" />
                </span>
                <span>{CLIENT_ROLE_LABELS[role]}</span>
              </button>
            );
          })}
        </div>
        {rolesError ? <p className="form-error" role="alert">{rolesError}</p> : null}
      </section>
    </>
  );

  const fiscalTab = (
    <>
      {!isIndividual ? (
        <section className="form-section form-section--first">
          <h2>Dados fiscais</h2>
          <div className="cadastro-grid">
            <label className="cadastro-field cadastro-field--span-4">
              <span className="field-label">Inscrição estadual <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.stateRegistration} onChange={(e) => set("stateRegistration", e.target.value)} />
            </label>
            <label className="cadastro-field cadastro-field--span-4">
              <span className="field-label">Inscrição municipal <span className="field-optional">(em breve)</span></span>
              <input type="text" disabled placeholder="Disponível após atualização do cadastro mestre" />
            </label>
            <div className="cadastro-field cadastro-field--span-4">
              <span className="field-label">Situação perante o ICMS <span className="field-optional">(em breve)</span></span>
              <div className="cadastro-segmented cadastro-segmented--disabled" role="group" aria-label="Situação perante o ICMS (indisponível)">
                <button type="button" className="cadastro-segmented-btn" disabled>Contribuinte</button>
                <button type="button" className="cadastro-segmented-btn" disabled>Isento</button>
                <button type="button" className="cadastro-segmented-btn" disabled>Não contribuinte</button>
              </div>
            </div>
          </div>
          <p className="helper-text">
            Inscrição municipal e situação perante o ICMS ainda não existem no cadastro mestre — ficam preparadas
            visualmente, sem gravar nada, até uma migration futura.
          </p>

          <div className="cadastro-grid" style={{ marginTop: "16px" }}>
            <label className="cadastro-field cadastro-field--span-8">
              <span className="field-label">Nome do responsável <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.responsibleName} onChange={(e) => set("responsibleName", e.target.value)} />
            </label>
            <label className="cadastro-field cadastro-field--span-4">
              <span className="field-label">CPF do responsável <span className="field-optional">(opcional)</span></span>
              <input type="text" value={payload.responsibleCpf} onChange={(e) => set("responsibleCpf", e.target.value)} placeholder="000.000.000-00" />
            </label>
          </div>
        </section>
      ) : (
        <section className="form-section form-section--first">
          <h2>Dados fiscais</h2>
          <p className="helper-text">Os campos fiscais desta aba se aplicam a pessoa jurídica.</p>
        </section>
      )}

      <section className="form-section">
        <h2>E-mail fiscal / NFS-e</h2>
        <div className="cadastro-status-inline">
          <button type="button" role="switch" aria-checked={true} className="switch-control is-on" disabled>
            <span className="switch-track" aria-hidden="true">
              <span className="switch-thumb" />
            </span>
            <span>Usar o mesmo e-mail de contato</span>
          </button>
        </div>
        <div className="cadastro-grid" style={{ marginTop: "12px" }}>
          <label className="cadastro-field cadastro-field--span-6">
            <span className="field-label">E-mail fiscal / NFS-e <span className="field-optional">(em breve)</span></span>
            <input type="email" disabled value={payload.email} />
          </label>
        </div>
        <p className="helper-text">
          O cadastro mestre ainda não tem um campo `fiscal_email` próprio — a emissão de NFS-e usa o e-mail de
          contato por enquanto. Quando o campo existir, esta chave poderá ser desligada para informar um e-mail
          fiscal diferente.
        </p>
      </section>
    </>
  );

  const familiaTab = (
    <section className="form-section form-section--first">
      <h2>Família e aniversários</h2>
      <p className="helper-text">
        Aniversariantes é uma <strong>base editorial separada</strong> do cadastro mestre (decisão confirmada) — usada
        pelo jornal para a lista de aniversariantes, publicação impressa e, futuramente, comunicação por WhatsApp.
        Editar nome/nascimento/cidade ali NUNCA altera este cadastro.
      </p>

      <div className="aniv-principal-card">
        <p className="field-label">Cadastro principal</p>
        <p className="aniv-entry-name">
          {isIndividual ? payload.fullName || "(sem nome ainda)" : payload.companyName || "(sem razão social ainda)"}
        </p>
        {isIndividual ? (
          <p className="helper-text">
            Nascimento: {payload.birthDate ? new Date(`${payload.birthDate}T00:00:00`).toLocaleDateString("pt-BR") : "não informado"} ·
            Cidade: {payload.addressCity || "não informada"} · Origem: Cadastro principal
          </p>
        ) : (
          <p className="helper-text">Pessoa jurídica não possui aniversário próprio — ver pessoas relacionadas abaixo.</p>
        )}
        {isIndividual && payload.birthDate ? (
          <p className="helper-text">
            Com nascimento informado, este cadastro já fica disponível automaticamente em <strong>Aniversariantes</strong>,
            sem nenhum cadastro manual duplicado.
          </p>
        ) : null}
      </div>

      {isIndividual ? (
        <section className="form-section" style={{ marginTop: "16px" }}>
          <h2>Aniversariantes já existentes</h2>
          <p className="helper-text">
            Procura, na base editorial de Aniversariantes, pessoas já cadastradas manualmente (familiares/pessoas
            relacionadas) que podem ser esta mesma pessoa — útil para aproveitar listas antigas sem duplicar cadastro.
            Compara nome, dia/mês de nascimento e cidade; nunca vincula automaticamente, só sugere para confirmação.
          </p>
          {mode === "create" ? (
            <p className="helper-text">Disponível após salvar este cadastro — abra aqui novamente para localizar aniversariantes existentes.</p>
          ) : (
            <BirthdayCandidateSearch
              clientId={client!.id}
              fullName={payload.fullName}
              birthDate={payload.birthDate}
              city={payload.addressCity}
            />
          )}
        </section>
      ) : null}

      <h2 style={{ marginTop: "16px" }}>{isIndividual ? "Familiares / pessoas relacionadas" : "Pessoas relacionadas / aniversariantes"}</h2>
      <p className="helper-text">
        Demonstração local (preview) apenas — nada aqui é enviado ao salvar este cadastro. A base real fica em{" "}
        <strong>Aniversariantes</strong>.
      </p>

      {familyMembers.length > 0 ? (
        <ul className="cadastro-family-tree">
          {familyMembers.map((member) => (
            <li key={member.id}>
              {member.name}
              {member.relationship ? ` — ${member.relationship}` : ""}
              {member.birthDate ? ` — ${new Date(`${member.birthDate}T00:00:00`).toLocaleDateString("pt-BR")}` : ""}
              {member.city ? ` — ${member.city}` : ""}
            </li>
          ))}
        </ul>
      ) : null}

      {familyFormOpen ? (
        <div className="aniv-entry--editing" style={{ marginTop: "12px" }}>
          <div className="cadastro-grid">
            <label className="cadastro-field cadastro-field--span-4">
              <span className="field-label">Nome</span>
              <input type="text" value={familyDraft.name} onChange={(e) => setFamilyDraft((d) => ({ ...d, name: e.target.value }))} />
            </label>
            <label className="cadastro-field cadastro-field--span-3">
              <span className="field-label">Parentesco <span className="field-optional">(opcional)</span></span>
              <input
                type="text"
                value={familyDraft.relationship}
                onChange={(e) => setFamilyDraft((d) => ({ ...d, relationship: e.target.value }))}
                placeholder={isIndividual ? "Cônjuge, Filho(a)..." : "Responsável, Sócio..."}
              />
            </label>
            <label className="cadastro-field cadastro-field--span-2">
              <span className="field-label">Nascimento</span>
              <input type="date" value={familyDraft.birthDate} onChange={(e) => setFamilyDraft((d) => ({ ...d, birthDate: e.target.value }))} />
            </label>
            <label className="cadastro-field cadastro-field--span-3">
              <span className="field-label">Cidade</span>
              <input type="text" value={familyDraft.city} onChange={(e) => setFamilyDraft((d) => ({ ...d, city: e.target.value }))} />
            </label>
          </div>
          <div className="aniv-entry-actions">
            <button type="button" className="cadastros-btn-primary" onClick={addFamilyMember}>Adicionar (preview)</button>
            <button type="button" className="cadastros-btn-secondary" onClick={() => setFamilyFormOpen(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" className="cadastros-btn-secondary aniv-add-btn" onClick={() => setFamilyFormOpen(true)}>
          + {isIndividual ? "Adicionar familiar" : "Adicionar pessoa"}
        </button>
      )}
    </section>
  );

  const anexosTab = (
    <section className="form-section form-section--first">
      <h2>Anexos</h2>
      <div className="cadastro-empty-box">
        <p>Nenhum anexo ainda.</p>
        <p className="helper-text">Upload de arquivos relacionados ao cadastro será disponibilizado em uma fase futura.</p>
      </div>
    </section>
  );

  const observacoesTab = (
    <section className="form-section form-section--first">
      <h2>Observações</h2>
      <label className="cadastro-field cadastro-field--span-12">
        <span className="field-label">Observações <span className="field-optional">(opcional)</span></span>
        <textarea rows={4} value={payload.notes} onChange={(e) => set("notes", e.target.value)} />
      </label>
    </section>
  );

  const tabs: TabItem[] = [
    { id: "geral", label: "Dados gerais", content: dadosGeraisTab },
    { id: "fiscal", label: "Fiscal", content: fiscalTab },
    { id: "familia", label: "Família e aniversários", content: familiaTab },
    { id: "anexos", label: "Anexos", content: anexosTab },
    { id: "observacoes", label: "Observações", content: observacoesTab },
  ];

  return (
    <div className="cadastro-form">
      <Tabs tabs={tabs} />

      <div className="form-actions cadastro-actions">
        <button type="button" className="form-action-primary" onClick={handleSubmit} disabled={pending}>
          {pending ? "Salvando…" : mode === "create" ? "Criar cadastro" : "Salvar alterações"}
        </button>
        <button type="button" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
