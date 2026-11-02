"use client";

// Bloco D — Página pública de complementação cadastral (02/11/2026).
// Formulário único (sem passos separados "avançar/voltar") para caber
// bem no celular: seção de verificação de código primeiro, depois as
// seções de dados liberadas só após a posse do canal ser confirmada —
// "antes de exibir ou modificar dados já existentes, exigir verificação".
import { useEffect, useState, useTransition } from "react";
import {
  addClientCompletionFamilyMemberAction, addClientCompletionRelatedPersonAction,
  getClientCompletionSnapshotAction, saveClientCompletionDataAction,
  sendClientCompletionOtpAction, verifyClientCompletionOtpAction,
  type ClientCompletionSnapshot,
} from "../../app/complementar-cadastro/actions";

const ROLE_LABELS: Record<string, string> = {
  responsavel: "Responsável", socio: "Sócio(a)", colaborador: "Colaborador(a)", outro: "Outro",
};

function dateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function ClientCompletionWizard({ token, channel }: { token: string; channel: "whatsapp" | "email" }): JSX.Element {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  // Verificação de posse de canal.
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verified, setVerified] = useState(false);

  // Dados carregados após a verificação.
  const [snapshot, setSnapshot] = useState<ClientCompletionSnapshot | null>(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [completed, setCompleted] = useState(false);

  // Campos editáveis — inicializados quando o snapshot chega.
  const [phonePrimary, setPhonePrimary] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [addressNeighborhood, setAddressNeighborhood] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [foundingDate, setFoundingDate] = useState("");
  const [titularConsent, setTitularConsent] = useState(false);

  // Familiares (PF) / pessoas vinculadas (PJ).
  const [newFamilyName, setNewFamilyName] = useState("");
  const [newFamilyRelationship, setNewFamilyRelationship] = useState("");
  const [newFamilyDay, setNewFamilyDay] = useState("");
  const [newFamilyMonth, setNewFamilyMonth] = useState("");
  const [newFamilyConsent, setNewFamilyConsent] = useState(false);
  const [confirmedNoFamily, setConfirmedNoFamily] = useState(false);
  const [askingNoFamily, setAskingNoFamily] = useState(false);

  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonRole, setNewPersonRole] = useState<"responsavel" | "socio" | "colaborador" | "outro">("responsavel");
  const [newPersonPhone, setNewPersonPhone] = useState("");
  const [newPersonEmail, setNewPersonEmail] = useState("");

  useEffect(() => {
    if (!snapshot) return;
    setPhonePrimary(snapshot.phonePrimary ?? "");
    setWhatsapp(snapshot.whatsapp ?? "");
    setEmail(snapshot.email ?? "");
    setAddressZip(snapshot.addressZip ?? "");
    setAddressStreet(snapshot.addressStreet ?? "");
    setAddressNumber(snapshot.addressNumber ?? "");
    setAddressComplement(snapshot.addressComplement ?? "");
    setAddressNeighborhood(snapshot.addressNeighborhood ?? "");
    setAddressCity(snapshot.addressCity ?? "");
    setAddressState(snapshot.addressState ?? "");
    setBirthDate(dateInputValue(snapshot.birthDate));
    setFoundingDate(dateInputValue(snapshot.foundingDate));
    setTitularConsent(snapshot.titularConsent === "granted");
    setConfirmedNoFamily(snapshot.familyMembersConfirmedEmpty);
  }, [snapshot]);

  function loadSnapshot(): void {
    startTransition(async () => {
      const result = await getClientCompletionSnapshotAction(token);
      if ("error" in result) { setError(result.error); return; }
      setSnapshot(result.snapshot);
    });
  }

  function sendCode(): void {
    setError("");
    startTransition(async () => {
      const result = await sendClientCompletionOtpAction(token);
      if ("error" in result) { setError(result.error); return; }
      setOtpSent(true);
    });
  }

  function verifyCode(): void {
    setError("");
    startTransition(async () => {
      const result = await verifyClientCompletionOtpAction(token, otpCode);
      if ("error" in result) { setError(result.error); return; }
      setVerified(true);
      loadSnapshot();
    });
  }

  function addFamilyMember(): void {
    setError("");
    const day = Number(newFamilyDay), month = Number(newFamilyMonth);
    if (!newFamilyName.trim()) { setError("Informe o nome do familiar."); return; }
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
      setError("Informe dia e mês válidos do aniversário.");
      return;
    }
    startTransition(async () => {
      const result = await addClientCompletionFamilyMemberAction(token, {
        displayName: newFamilyName, relationship: newFamilyRelationship || undefined,
        birthMonth: month, birthDay: day, consent: newFamilyConsent,
      });
      if ("error" in result) { setError(result.error); return; }
      setNewFamilyName(""); setNewFamilyRelationship(""); setNewFamilyDay(""); setNewFamilyMonth(""); setNewFamilyConsent(false);
      setConfirmedNoFamily(true);
      setAskingNoFamily(false);
      loadSnapshot();
    });
  }

  function addRelatedPerson(): void {
    setError("");
    if (!newPersonName.trim()) { setError("Informe o nome da pessoa vinculada."); return; }
    startTransition(async () => {
      const result = await addClientCompletionRelatedPersonAction(token, {
        fullName: newPersonName, roleType: newPersonRole, phone: newPersonPhone || undefined, email: newPersonEmail || undefined,
      });
      if ("error" in result) { setError(result.error); return; }
      setNewPersonName(""); setNewPersonPhone(""); setNewPersonEmail("");
      loadSnapshot();
    });
  }

  function confirmNoFamily(): void {
    setConfirmedNoFamily(true);
    setAskingNoFamily(false);
    finalize(true);
  }

  function submit(finalizeNow: boolean): void {
    setError("");
    setSavedMsg("");
    if (!snapshot) return;
    if (finalizeNow && snapshot.kind === "individual" && snapshot.familyMembers.length === 0 && !confirmedNoFamily) {
      setAskingNoFamily(true);
      return;
    }
    finalize(finalizeNow);
  }

  function finalize(finalizeNow: boolean): void {
    if (!snapshot) return;
    startTransition(async () => {
      const result = await saveClientCompletionDataAction(token, {
        phone_primary: phonePrimary || undefined, whatsapp: whatsapp || undefined, email: email || undefined,
        address_zip: addressZip || undefined, address_street: addressStreet || undefined,
        address_number: addressNumber || undefined, address_complement: addressComplement || undefined,
        address_neighborhood: addressNeighborhood || undefined, address_city: addressCity || undefined,
        address_state: addressState || undefined,
        birth_date: snapshot.kind === "individual" ? (birthDate || undefined) : undefined,
        founding_date: snapshot.kind === "company" ? (foundingDate || undefined) : undefined,
        family_members_confirmed_empty: confirmedNoFamily || undefined,
        titular_consent: titularConsent,
      }, finalizeNow);
      if ("error" in result) { setError(result.error); return; }
      if (finalizeNow) { setCompleted(true); return; }
      setSavedMsg("Dados salvos. Você pode continuar completando o cadastro.");
      loadSnapshot();
    });
  }

  if (completed) {
    return (
      <section className="form-section" role="status">
        <h2>Cadastro concluído</h2>
        <p>Seus dados foram atualizados com sucesso. Obrigado por completar o cadastro com o Informativo Regional.</p>
      </section>
    );
  }

  if (!verified) {
    return (
      <section className="form-section">
        <p className="helper-text">
          Por segurança, antes de exibir ou alterar qualquer dado do seu cadastro, enviamos um código de
          verificação para o {channel === "email" ? "e-mail" : "WhatsApp"} já cadastrado.
        </p>
        <button type="button" className="form-action-primary" onClick={sendCode} disabled={pending}>
          {otpSent ? "Reenviar código" : "Enviar código de verificação"}
        </button>
        {otpSent ? (
          <div className="form-actions" style={{ marginTop: 12 }}>
            <input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} inputMode="numeric"
              autoComplete="one-time-code" placeholder="Código recebido" aria-label="Código de verificação" maxLength={8} />
            <button type="button" onClick={verifyCode} disabled={pending || otpCode.trim().length < 4}>
              Confirmar código
            </button>
          </div>
        ) : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </section>
    );
  }

  if (!snapshot) {
    return <p className="helper-text">Carregando seus dados…</p>;
  }

  return (
    <div>
      <section className="form-section form-section--first">
        <h2>Seus dados</h2>
        <p className="helper-text">{snapshot.fullName ?? snapshot.companyName}</p>
        <label className="form-field" style={{ display: "block" }}>
          <span className="field-label">Telefone</span>
          <input value={phonePrimary} onChange={(e) => setPhonePrimary(e.target.value)} />
        </label>
        <label className="form-field" style={{ display: "block", marginTop: 8 }}>
          <span className="field-label">WhatsApp</span>
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
        </label>
        <label className="form-field" style={{ display: "block", marginTop: 8 }}>
          <span className="field-label">E-mail</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </section>

      <section className="form-section">
        <h2>Endereço</h2>
        <label className="form-field" style={{ display: "block" }}>
          <span className="field-label">CEP</span>
          <input value={addressZip} onChange={(e) => setAddressZip(e.target.value)} />
        </label>
        <label className="form-field" style={{ display: "block", marginTop: 8 }}>
          <span className="field-label">Rua</span>
          <input value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} />
        </label>
        <label className="form-field" style={{ display: "block", marginTop: 8 }}>
          <span className="field-label">Número</span>
          <input value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} />
        </label>
        <label className="form-field" style={{ display: "block", marginTop: 8 }}>
          <span className="field-label">Complemento</span>
          <input value={addressComplement} onChange={(e) => setAddressComplement(e.target.value)} />
        </label>
        <label className="form-field" style={{ display: "block", marginTop: 8 }}>
          <span className="field-label">Bairro</span>
          <input value={addressNeighborhood} onChange={(e) => setAddressNeighborhood(e.target.value)} />
        </label>
        <label className="form-field" style={{ display: "block", marginTop: 8 }}>
          <span className="field-label">Cidade</span>
          <input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} />
        </label>
        <label className="form-field" style={{ display: "block", marginTop: 8 }}>
          <span className="field-label">UF</span>
          <input value={addressState} onChange={(e) => setAddressState(e.target.value)} maxLength={2} />
        </label>
      </section>

      {snapshot.kind === "individual" ? (
        <section className="form-section">
          <h2>Data de nascimento</h2>
          <label className="form-field" style={{ display: "block" }}>
            <span className="field-label">Data completa (dia/mês/ano)</span>
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </label>
        </section>
      ) : (
        <section className="form-section">
          <h2>Data de fundação</h2>
          <label className="form-field" style={{ display: "block" }}>
            <span className="field-label">Data de fundação</span>
            <input type="date" value={foundingDate} onChange={(e) => setFoundingDate(e.target.value)} />
          </label>
        </section>
      )}

      {(snapshot.kind === "individual" ? birthDate : foundingDate) ? (
        <section className="form-section">
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input type="checkbox" checked={titularConsent} onChange={(e) => setTitularConsent(e.target.checked)} />
            <span>
              Autorizo a publicação do dia e mês (sem o ano) na lista de Aniversariantes do jornal impresso.
              Esta autorização é opcional e pode ser retirada depois, falando com a equipe do Informativo Regional.
            </span>
          </label>
        </section>
      ) : null}

      {snapshot.kind === "individual" ? (
        <section className="form-section">
          <h2>Familiares (opcional)</h2>
          <p className="helper-text">
            Cadastrar familiares é opcional. Quem for cadastrado aparece com dia/mês de aniversário (sem o ano) na
            lista de Aniversariantes só se a publicação for autorizada abaixo.
          </p>
          {snapshot.familyMembers.length > 0 ? (
            <ul>
              {snapshot.familyMembers.map((m) => (
                <li key={m.id}>
                  {m.displayName} — {String(m.birthDay).padStart(2, "0")}/{String(m.birthMonth).padStart(2, "0")}
                  {m.relationship ? ` (${m.relationship})` : ""}
                  {m.consentStatus === "granted" ? " — publicação autorizada" : " — publicação não autorizada"}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="form-grid">
            <label className="form-field" style={{ display: "block" }}>
              <span className="field-label">Nome</span>
              <input value={newFamilyName} onChange={(e) => setNewFamilyName(e.target.value)} />
            </label>
            <label className="form-field" style={{ display: "block" }}>
              <span className="field-label">Vínculo (ex.: filho, esposa)</span>
              <input value={newFamilyRelationship} onChange={(e) => setNewFamilyRelationship(e.target.value)} />
            </label>
            <label className="form-field" style={{ display: "block" }}>
              <span className="field-label">Dia</span>
              <input value={newFamilyDay} onChange={(e) => setNewFamilyDay(e.target.value)} inputMode="numeric" maxLength={2} />
            </label>
            <label className="form-field" style={{ display: "block" }}>
              <span className="field-label">Mês</span>
              <input value={newFamilyMonth} onChange={(e) => setNewFamilyMonth(e.target.value)} inputMode="numeric" maxLength={2} />
            </label>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 8 }}>
            <input type="checkbox" checked={newFamilyConsent} onChange={(e) => setNewFamilyConsent(e.target.checked)} />
            <span>Autorizo a publicação do dia e mês deste familiar (sem o ano) na lista de Aniversariantes.</span>
          </label>
          <div className="form-actions" style={{ marginTop: 8 }}>
            <button type="button" onClick={addFamilyMember} disabled={pending}>Adicionar familiar</button>
          </div>
          {askingNoFamily ? (
            <div className="form-section--compact" style={{ border: "1px solid var(--site-line, #ccc)", borderRadius: 8, padding: 10, marginTop: 12 }}>
              <p className="helper-text">Você não cadastrou nenhum familiar. Tem certeza de que quer continuar sem cadastrar?</p>
              <div className="materias-toolbar-actions">
                <button type="button" onClick={confirmNoFamily} disabled={pending}>Continuar sem cadastrar</button>
                <button type="button" className="secondary-link" onClick={() => setAskingNoFamily(false)} disabled={pending}>Voltar e adicionar</button>
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="form-section">
          <h2>Pessoas vinculadas</h2>
          <p className="helper-text">Responsáveis, sócios ou colaboradores que respondem por esta empresa.</p>
          {snapshot.relatedPersons.length > 0 ? (
            <ul>
              {snapshot.relatedPersons.map((p) => (
                <li key={p.id}>{p.fullName} — {ROLE_LABELS[p.roleType] ?? p.roleType}</li>
              ))}
            </ul>
          ) : null}
          <div className="form-grid">
            <label className="form-field" style={{ display: "block" }}>
              <span className="field-label">Nome</span>
              <input value={newPersonName} onChange={(e) => setNewPersonName(e.target.value)} />
            </label>
            <label className="form-field" style={{ display: "block" }}>
              <span className="field-label">Vínculo</span>
              <select value={newPersonRole} onChange={(e) => setNewPersonRole(e.target.value as typeof newPersonRole)}>
                <option value="responsavel">Responsável</option>
                <option value="socio">Sócio(a)</option>
                <option value="colaborador">Colaborador(a)</option>
                <option value="outro">Outro</option>
              </select>
            </label>
            <label className="form-field" style={{ display: "block" }}>
              <span className="field-label">Telefone</span>
              <input value={newPersonPhone} onChange={(e) => setNewPersonPhone(e.target.value)} />
            </label>
            <label className="form-field" style={{ display: "block" }}>
              <span className="field-label">E-mail</span>
              <input type="email" value={newPersonEmail} onChange={(e) => setNewPersonEmail(e.target.value)} />
            </label>
          </div>
          <div className="form-actions" style={{ marginTop: 8 }}>
            <button type="button" onClick={addRelatedPerson} disabled={pending}>Adicionar pessoa vinculada</button>
          </div>
        </section>
      )}

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {savedMsg ? <p role="status">{savedMsg}</p> : null}
      <section className="form-section">
        <div className="form-actions">
          <button type="button" onClick={() => submit(false)} disabled={pending}>Salvar e continuar depois</button>
          <button type="button" className="form-action-primary" onClick={() => submit(true)} disabled={pending}>
            {pending ? "Enviando…" : "Concluir cadastro"}
          </button>
        </div>
      </section>
    </div>
  );
}
