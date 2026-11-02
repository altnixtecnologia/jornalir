"use client";

// Bloco B — Cadastro complementar (02/11/2026). Seção adicional na tela
// de detalhe do cliente (não altera BirthdaysList.tsx/messageGenerator.ts
// — aqui só cria/inativa linhas; a listagem/geração de mensagens
// editoriais continua exclusivamente no módulo Aniversariantes).
import { useState, useTransition } from "react";
import {
  addFamilyMemberAction,
  addRelatedPersonAction,
  confirmNoFamilyMembersAction,
  deactivateFamilyMemberAction,
  deactivateRelatedPersonAction,
  type FamilyMemberInput,
  type RelatedPersonInput,
} from "../../app/sistema/clientes/complementacao-actions";
import { notify } from "../../lib/feedback/notify";

export interface FamilyMemberRow {
  id: string;
  displayName: string;
  birthMonth: number;
  birthDay: number;
  relationship: string | null;
  consentStatus: "pending" | "granted" | "denied";
  isMinor: boolean | null;
}

export interface RelatedPersonRow {
  id: string;
  fullName: string;
  roleType: "responsavel" | "socio" | "colaborador" | "outro";
  cpf: string | null;
  phone: string | null;
  email: string | null;
}

const ROLE_LABELS: Record<RelatedPersonRow["roleType"], string> = {
  responsavel: "Responsável",
  socio: "Sócio(a)",
  colaborador: "Colaborador(a)",
  outro: "Outro",
};

const CONSENT_LABELS: Record<FamilyMemberRow["consentStatus"], string> = {
  pending: "Consentimento de publicação pendente",
  granted: "Publicação autorizada",
  denied: "Publicação negada",
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function FamilyAndRelatedPersonsControl({
  clientId,
  clientKind,
  familyMembers,
  familyConfirmedEmpty,
  relatedPersons,
}: {
  clientId: string;
  clientKind: "individual" | "company";
  familyMembers: FamilyMemberRow[];
  familyConfirmedEmpty: boolean;
  relatedPersons: RelatedPersonRow[];
}): JSX.Element {
  const [pending, start] = useTransition();
  const [confirmedEmpty, setConfirmedEmpty] = useState(familyConfirmedEmpty);

  const [familyName, setFamilyName] = useState("");
  const [familyDay, setFamilyDay] = useState("");
  const [familyMonth, setFamilyMonth] = useState("");
  const [familyRelationship, setFamilyRelationship] = useState("");
  const [familyIsMinor, setFamilyIsMinor] = useState(false);
  const [familyGuardian, setFamilyGuardian] = useState("");

  const [personName, setPersonName] = useState("");
  const [personRole, setPersonRole] = useState<RelatedPersonRow["roleType"]>("responsavel");
  const [personCpf, setPersonCpf] = useState("");
  const [personPhone, setPersonPhone] = useState("");

  function submitFamilyMember(): void {
    const input: FamilyMemberInput = {
      displayName: familyName,
      birthDay: Number(familyDay),
      birthMonth: Number(familyMonth),
      relationship: familyRelationship || undefined,
      isMinor: familyIsMinor,
      guardianName: familyIsMinor ? familyGuardian : undefined,
    };
    start(async () => {
      const result = await addFamilyMemberAction(clientId, input);
      if ("error" in result) {
        notify.error("Não foi possível adicionar o familiar", result.error);
        return;
      }
      notify.success("Familiar adicionado", "Consentimento de publicação começa como pendente — nunca presumido.");
      setFamilyName("");
      setFamilyDay("");
      setFamilyMonth("");
      setFamilyRelationship("");
      setFamilyIsMinor(false);
      setFamilyGuardian("");
      setConfirmedEmpty(true);
    });
  }

  function removeFamilyMember(id: string): void {
    start(async () => {
      const result = await deactivateFamilyMemberAction(id, clientId);
      if ("error" in result) notify.error("Não foi possível remover", result.error);
      else notify.success("Removido", "O familiar foi marcado como inativo.");
    });
  }

  function confirmNoFamily(): void {
    start(async () => {
      const result = await confirmNoFamilyMembersAction(clientId);
      if ("error" in result) {
        notify.error("Não foi possível confirmar", result.error);
        return;
      }
      setConfirmedEmpty(true);
      notify.success("Confirmado", "Nenhum familiar será cadastrado agora. É possível adicionar depois quando quiser.");
    });
  }

  function submitRelatedPerson(): void {
    const input: RelatedPersonInput = {
      fullName: personName,
      roleType: personRole,
      cpf: personCpf || undefined,
      phone: personPhone || undefined,
    };
    start(async () => {
      const result = await addRelatedPersonAction(clientId, input);
      if ("error" in result) {
        notify.error("Não foi possível adicionar", result.error);
        return;
      }
      notify.success("Pessoa vinculada adicionada", "");
      setPersonName("");
      setPersonCpf("");
      setPersonPhone("");
    });
  }

  function removeRelatedPerson(id: string): void {
    start(async () => {
      const result = await deactivateRelatedPersonAction(id, clientId);
      if ("error" in result) notify.error("Não foi possível remover", result.error);
      else notify.success("Removido", "");
    });
  }

  return (
    <>
      {clientKind === "individual" ? (
        <section className="form-section">
          <h2>Familiares</h2>
          <p className="helper-text">
            Apenas dia e mês de nascimento — sem ano. A publicação no jornal nunca é presumida: cada familiar nasce com
            consentimento pendente até a equipe registrar a preferência (importante para menores de idade).
          </p>

          {familyMembers.length === 0 ? (
            confirmedEmpty ? (
              <p className="helper-text">Confirmado: nenhum familiar cadastrado por enquanto.</p>
            ) : (
              <div className="form-section--compact">
                <p className="helper-text">Nenhum familiar adicionado ainda.</p>
                <button type="button" className="secondary-link" disabled={pending} onClick={confirmNoFamily}>
                  Confirmar que não há familiares a cadastrar
                </button>
              </div>
            )
          ) : (
            <ul className="helper-text">
              {familyMembers.map((member) => (
                <li key={member.id}>
                  <strong>{member.displayName}</strong> — {pad2(member.birthDay)}/{pad2(member.birthMonth)}
                  {member.relationship ? ` · ${member.relationship}` : ""} · {CONSENT_LABELS[member.consentStatus]}
                  {member.isMinor ? " · menor de idade" : ""}
                  {" "}
                  <button type="button" className="secondary-link" disabled={pending} onClick={() => removeFamilyMember(member.id)}>
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="form-grid" style={{ marginTop: "12px" }}>
            <label className="text-sm">
              <span className="field-label">Nome *</span>
              <input value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="field-label">Dia *</span>
              <input inputMode="numeric" maxLength={2} value={familyDay} onChange={(e) => setFamilyDay(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="field-label">Mês *</span>
              <input inputMode="numeric" maxLength={2} value={familyMonth} onChange={(e) => setFamilyMonth(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="field-label">Parentesco</span>
              <input value={familyRelationship} onChange={(e) => setFamilyRelationship(e.target.value)} placeholder="Ex.: Cônjuge, filho(a)..." />
            </label>
            <label className="text-sm">
              <input type="checkbox" checked={familyIsMinor} onChange={(e) => setFamilyIsMinor(e.target.checked)} />
              {" "}Menor de idade
            </label>
            {familyIsMinor ? (
              <label className="text-sm">
                <span className="field-label">Nome do responsável *</span>
                <input value={familyGuardian} onChange={(e) => setFamilyGuardian(e.target.value)} />
              </label>
            ) : null}
          </div>
          <button
            type="button"
            className="form-action-primary"
            disabled={pending || !familyName.trim() || !familyDay || !familyMonth}
            onClick={submitFamilyMember}
          >
            Adicionar familiar
          </button>
        </section>
      ) : (
        <section className="form-section">
          <h2>Pessoas vinculadas</h2>
          <p className="helper-text">Responsáveis, sócios ou colaboradores vinculados a esta empresa.</p>

          {relatedPersons.length === 0 ? (
            <p className="helper-text">Nenhuma pessoa vinculada cadastrada ainda.</p>
          ) : (
            <ul className="helper-text">
              {relatedPersons.map((person) => (
                <li key={person.id}>
                  <strong>{person.fullName}</strong> — {ROLE_LABELS[person.roleType]}
                  {person.phone ? ` · ${person.phone}` : ""}
                  {" "}
                  <button type="button" className="secondary-link" disabled={pending} onClick={() => removeRelatedPerson(person.id)}>
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="form-grid" style={{ marginTop: "12px" }}>
            <label className="text-sm">
              <span className="field-label">Nome *</span>
              <input value={personName} onChange={(e) => setPersonName(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="field-label">Vínculo *</span>
              <select value={personRole} onChange={(e) => setPersonRole(e.target.value as RelatedPersonRow["roleType"])}>
                <option value="responsavel">Responsável</option>
                <option value="socio">Sócio(a)</option>
                <option value="colaborador">Colaborador(a)</option>
                <option value="outro">Outro</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="field-label">CPF</span>
              <input value={personCpf} onChange={(e) => setPersonCpf(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="field-label">Telefone</span>
              <input value={personPhone} onChange={(e) => setPersonPhone(e.target.value)} />
            </label>
          </div>
          <button type="button" className="form-action-primary" disabled={pending || !personName.trim()} onClick={submitRelatedPerson}>
            Adicionar pessoa vinculada
          </button>
        </section>
      )}
    </>
  );
}
