"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getRepresentativeSignatureUrlAction,
  removeRepresentativeSignatureAction,
  saveCompanyProfileAction,
  saveLegalRepresentativeAction,
  setLegalRepresentativeActiveAction,
  uploadRepresentativeSignatureAction,
} from "../../app/sistema/configuracoes/empresa/actions";
import { notify } from "../../lib/feedback/notify";

export interface CompanyProfileRecord {
  legal_name: string;
  trade_name: string | null;
  cnpj: string;
  state_registration: string | null;
  municipal_registration: string | null;
  address_street: string;
  address_number: string | null;
  address_complement: string | null;
  address_district: string | null;
  address_city: string;
  address_state: string;
  address_zip: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
}

export interface LegalRepresentativeRecord {
  id: string;
  full_name: string;
  cpf: string;
  role_title: string;
  nationality: string | null;
  email: string | null;
  phone: string | null;
  representation_rule: "individual" | "joint";
  powers_description: string;
  powers_evidence_note: string | null;
  powers_valid_from: string | null;
  powers_valid_until: string | null;
  active: boolean;
  is_default: boolean;
  signature_sha256: string | null;
  signature_bytes: number | null;
  signature_updated_at: string | null;
}

interface RepEditor {
  id: string | null;
  fullName: string;
  cpf: string;
  roleTitle: string;
  nationality: string;
  email: string;
  phone: string;
  representationRule: "individual" | "joint";
  powersDescription: string;
  powersEvidenceNote: string;
  powersValidFrom: string;
  powersValidUntil: string;
  isDefault: boolean;
}

const EMPTY_REP: RepEditor = {
  id: null, fullName: "", cpf: "", roleTitle: "", nationality: "Brasileiro(a)", email: "", phone: "",
  representationRule: "individual", powersDescription: "", powersEvidenceNote: "", powersValidFrom: "",
  powersValidUntil: "", isDefault: false,
};

function maskCpf(cpf: string): string {
  return cpf.length === 11 ? `${cpf.slice(0, 3)}.***.***-${cpf.slice(9)}` : cpf;
}

export function CompanySettingsManager({
  company,
  representatives,
}: {
  company: CompanyProfileRecord | null;
  representatives: LegalRepresentativeRecord[];
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    legalName: company?.legal_name ?? "",
    tradeName: company?.trade_name ?? "",
    cnpj: company?.cnpj ?? "",
    stateRegistration: company?.state_registration ?? "",
    municipalRegistration: company?.municipal_registration ?? "",
    addressStreet: company?.address_street ?? "",
    addressNumber: company?.address_number ?? "",
    addressComplement: company?.address_complement ?? "",
    addressDistrict: company?.address_district ?? "",
    addressCity: company?.address_city ?? "",
    addressState: company?.address_state ?? "RS",
    addressZip: company?.address_zip ?? "",
    email: company?.email ?? "",
    phone: company?.phone ?? "",
    website: company?.website ?? "",
  });
  const [rep, setRep] = useState<RepEditor | null>(null);
  const [repErrors, setRepErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function field(name: keyof typeof form, label: string, extra?: { wide?: boolean; placeholder?: string }): JSX.Element {
    return (
      <label className="form-field" style={extra?.wide ? { gridColumn: "1 / -1" } : undefined}>
        <span className="field-label">{label}</span>
        <input value={form[name]} placeholder={extra?.placeholder} onChange={(e) => setForm({ ...form, [name]: e.target.value })} />
        {errors[name] ? <span className="field-error" role="alert">{errors[name]}</span> : null}
      </label>
    );
  }

  function saveCompany(): void {
    startTransition(async () => {
      const result = await saveCompanyProfileAction(form);
      if ("error" in result) {
        setErrors(result.fieldErrors ?? {});
        notify.error("Não foi possível salvar os dados da empresa", result.error);
        return;
      }
      setErrors({});
      notify.success("Dados da empresa salvos", "As alterações foram registradas na auditoria.");
      router.refresh();
    });
  }

  function saveRep(): void {
    if (!rep) return;
    const { id, ...input } = rep;
    startTransition(async () => {
      const result = await saveLegalRepresentativeAction(id, input);
      if ("error" in result) {
        setRepErrors(result.fieldErrors ?? {});
        notify.error("Não foi possível salvar o representante", result.error);
        return;
      }
      setRep(null);
      setRepErrors({});
      notify.success("Representante salvo", "Os poderes de representação foram registrados.");
      router.refresh();
    });
  }

  function toggleActive(item: LegalRepresentativeRecord): void {
    startTransition(async () => {
      const result = await setLegalRepresentativeActiveAction(item.id, !item.active);
      if ("error" in result) { notify.error("Não foi possível alterar o representante", result.error); return; }
      notify.success(item.active ? "Representante desativado" : "Representante reativado", "A alteração foi registrada na auditoria.");
      router.refresh();
    });
  }

  function upload(item: LegalRepresentativeRecord, file: File | undefined): void {
    if (!file) return;
    const data = new FormData();
    data.set("representativeId", item.id);
    data.set("file", file);
    startTransition(async () => {
      const result = await uploadRepresentativeSignatureAction(data);
      if (fileRefs.current[item.id]) fileRefs.current[item.id]!.value = "";
      if ("error" in result) { notify.error("Não foi possível enviar a assinatura", result.error); return; }
      setPreview(null);
      notify.success("Assinatura gráfica salva", "Armazenada em área privada. Ela é só a imagem — a assinatura exige confirmação explícita.");
      router.refresh();
    });
  }

  function viewSignature(item: LegalRepresentativeRecord): void {
    startTransition(async () => {
      const result = await getRepresentativeSignatureUrlAction(item.id);
      if ("error" in result) { notify.error("Não foi possível exibir a assinatura", result.error); return; }
      setPreview({ id: item.id, url: result.url });
    });
  }

  function removeSignature(item: LegalRepresentativeRecord): void {
    startTransition(async () => {
      const result = await removeRepresentativeSignatureAction(item.id);
      if ("error" in result) { notify.error("Não foi possível remover a assinatura", result.error); return; }
      setPreview(null);
      notify.success("Assinatura removida", "O vínculo foi removido e o evento registrado na auditoria.");
      router.refresh();
    });
  }

  function repField(name: keyof Omit<RepEditor, "id" | "isDefault" | "representationRule" | "powersDescription">, label: string, type = "text"): JSX.Element {
    return (
      <label className="form-field">
        <span className="field-label">{label}</span>
        <input type={type} value={rep?.[name] ?? ""} onChange={(e) => rep && setRep({ ...rep, [name]: e.target.value })} />
        {repErrors[name] ? <span className="field-error" role="alert">{repErrors[name]}</span> : null}
      </label>
    );
  }

  return (
    <>
      <section className="form-section form-section--first">
        <h2>Dados da empresa (CONTRATADA)</h2>
        <p className="helper-text">
          Estes dados alimentam o cabeçalho dos contratos. São independentes do emissor fiscal da NFS-e.
        </p>
        <div className="form-grid">
          {field("legalName", "Razão social", { wide: true })}
          {field("tradeName", "Nome fantasia")}
          {field("cnpj", "CNPJ", { placeholder: "00.000.000/0000-00" })}
          {field("stateRegistration", "Inscrição estadual")}
          {field("municipalRegistration", "Inscrição municipal")}
          {field("addressStreet", "Logradouro", { wide: true })}
          {field("addressNumber", "Número")}
          {field("addressComplement", "Complemento")}
          {field("addressDistrict", "Bairro")}
          {field("addressCity", "Cidade")}
          {field("addressState", "UF")}
          {field("addressZip", "CEP")}
          {field("email", "E-mail institucional")}
          {field("phone", "Telefone")}
          {field("website", "Site")}
        </div>
        <div className="form-actions">
          <button type="button" className="form-action-primary" disabled={pending} onClick={saveCompany}>
            {pending ? "Salvando…" : "Salvar dados da empresa"}
          </button>
        </div>
      </section>

      <section className="form-section">
        <h2>Representante(s) legal(is)</h2>
        <p className="helper-text">
          Quem pode assinar pela empresa em contratos <strong>institucionais</strong>. O PNG é apenas a imagem da assinatura:
          nenhuma assinatura é aplicada sem confirmação explícita do representante (etapa futura). A imagem fica em
          armazenamento privado e só aparece para administradores.
        </p>
        <div className="form-actions">
          <button type="button" className="form-action-primary" disabled={pending} onClick={() => { setRepErrors({}); setRep({ ...EMPTY_REP }); }}>
            + Novo representante
          </button>
        </div>

        {representatives.length === 0 ? (
          <p className="helper-text" style={{ marginTop: 12 }}>Nenhum representante cadastrado.</p>
        ) : (
          <ul className="destaques-list" style={{ marginTop: 12 }}>
            {representatives.map((item) => (
              <li className="destaques-item" key={item.id}>
                <div className="destaques-item-body">
                  <span className="materia-title">
                    {item.full_name} — {item.role_title}
                    {item.is_default ? " · padrão" : ""}
                    {item.active ? "" : " · inativo"}
                  </span>
                  <span className="helper-text">
                    CPF {maskCpf(item.cpf)} · {item.representation_rule === "individual" ? "assina isoladamente" : "assina em conjunto"}
                    {item.powers_valid_until ? ` · poderes até ${item.powers_valid_until.split("-").reverse().join("/")}` : ""}
                    {" · "}
                    {item.signature_sha256
                      ? `PNG cadastrado (${Math.round((item.signature_bytes ?? 0) / 1024)} KB, hash ${item.signature_sha256.slice(0, 8)}…)`
                      : "sem PNG de assinatura"}
                  </span>
                  <span className="helper-text">{item.powers_description}</span>
                  {preview?.id === item.id ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview.url} alt={`Assinatura gráfica de ${item.full_name}`} style={{ maxWidth: 320, maxHeight: 120, background: "#fff", border: "1px solid #ddd", marginTop: 6 }} />
                  ) : null}
                </div>
                <div className="form-actions">
                  <button type="button" disabled={pending} onClick={() => {
                    setRepErrors({});
                    setRep({
                      id: item.id, fullName: item.full_name, cpf: item.cpf, roleTitle: item.role_title,
                      nationality: item.nationality ?? "", email: item.email ?? "", phone: item.phone ?? "",
                      representationRule: item.representation_rule, powersDescription: item.powers_description,
                      powersEvidenceNote: item.powers_evidence_note ?? "", powersValidFrom: item.powers_valid_from ?? "",
                      powersValidUntil: item.powers_valid_until ?? "", isDefault: item.is_default,
                    });
                  }}>Editar</button>
                  <button type="button" disabled={pending} onClick={() => toggleActive(item)}>{item.active ? "Desativar" : "Reativar"}</button>
                  <button type="button" disabled={pending} onClick={() => fileRefs.current[item.id]?.click()}>
                    {item.signature_sha256 ? "Trocar PNG" : "Enviar PNG"}
                  </button>
                  <input
                    ref={(node) => { fileRefs.current[item.id] = node; }}
                    type="file"
                    accept="image/png"
                    style={{ display: "none" }}
                    aria-label={`Enviar PNG da assinatura de ${item.full_name}`}
                    onChange={(e) => upload(item, e.target.files?.[0])}
                  />
                  {item.signature_sha256 ? (
                    <>
                      <button type="button" disabled={pending} onClick={() => viewSignature(item)}>Ver assinatura</button>
                      <button type="button" disabled={pending} onClick={() => removeSignature(item)}>Remover PNG</button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rep ? (
        <section className="form-section">
          <h2>{rep.id ? "Editar representante" : "Novo representante"}</h2>
          <div className="form-grid">
            {repField("fullName", "Nome completo")}
            {repField("cpf", "CPF")}
            {repField("roleTitle", "Cargo / qualificação")}
            {repField("nationality", "Nacionalidade")}
            {repField("email", "E-mail", "email")}
            {repField("phone", "Telefone")}
            <label className="form-field">
              <span className="field-label">Regra de representação</span>
              <select value={rep.representationRule} onChange={(e) => setRep({ ...rep, representationRule: e.target.value as "individual" | "joint" })}>
                <option value="individual">Assina isoladamente</option>
                <option value="joint">Assina em conjunto com outro(s)</option>
              </select>
            </label>
            {repField("powersValidFrom", "Poderes válidos a partir de", "date")}
            {repField("powersValidUntil", "Poderes válidos até", "date")}
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Poderes de representação (ex.: contrato social, cláusula, alcance)</span>
              <textarea rows={3} value={rep.powersDescription} onChange={(e) => setRep({ ...rep, powersDescription: e.target.value })} />
              {repErrors.powersDescription ? <span className="field-error" role="alert">{repErrors.powersDescription}</span> : null}
            </label>
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Documento que comprova os poderes (referência: ata, procuração, contrato social)</span>
              <input value={rep.powersEvidenceNote} onChange={(e) => setRep({ ...rep, powersEvidenceNote: e.target.value })} />
            </label>
            <label className="form-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={rep.isDefault} onChange={(e) => setRep({ ...rep, isDefault: e.target.checked })} />
              Representante padrão dos contratos institucionais
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="form-action-primary" disabled={pending} onClick={saveRep}>
              {pending ? "Salvando…" : "Salvar representante"}
            </button>
            <button type="button" onClick={() => setRep(null)}>Cancelar</button>
          </div>
        </section>
      ) : null}
    </>
  );
}
