"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NfseServiceProfile } from "@ir/types";
import {
  createServiceProfileAction,
  deactivateServiceProfileAction,
  reactivateServiceProfileAction,
  updateServiceProfileAction,
  type ServiceProfileFormInput,
} from "../../app/sistema/nfse/perfis-servico/actions";

function emptyInput(): ServiceProfileFormInput {
  return {
    name: "",
    cTribNac: "",
    cTribMun: "",
    cNBS: "",
    defaultLocationMunicipality: "",
    defaultLocationIbgeCode: "",
    issqnTaxation: "",
    specialTaxRegime: "",
    notes: "",
  };
}

function toInput(profile: NfseServiceProfile): ServiceProfileFormInput {
  return {
    name: profile.name,
    cTribNac: profile.cTribNac ?? "",
    cTribMun: profile.cTribMun ?? "",
    cNBS: profile.cNBS ?? "",
    defaultLocationMunicipality: profile.defaultLocationMunicipality ?? "",
    defaultLocationIbgeCode: profile.defaultLocationIbgeCode ?? "",
    issqnTaxation: profile.issqnTaxation ?? "",
    specialTaxRegime: profile.specialTaxRegime ?? "",
    notes: profile.notes ?? "",
  };
}

/**
 * Perfis de serviço (Parte 1, item 5) — evita preencher toda a
 * configuração fiscal em cada emissão. Nenhum seed de código fiscal:
 * todo perfil novo nasce com os campos fiscais vazios. Nunca excluído
 * — só desativado/reativado.
 */
export function NfseServiceProfilesPanel({ profiles }: { profiles: NfseServiceProfile[] }): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [input, setInput] = useState<ServiceProfileFormInput>(emptyInput());

  function startCreate(): void {
    setInput(emptyInput());
    setEditingId("new");
    setError(null);
  }

  function startEdit(profile: NfseServiceProfile): void {
    setInput(toInput(profile));
    setEditingId(profile.id);
    setError(null);
  }

  function cancel(): void {
    setEditingId(null);
    setError(null);
  }

  function set<K extends keyof ServiceProfileFormInput>(key: K, value: ServiceProfileFormInput[K]): void {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  function save(): void {
    setError(null);
    startTransition(async () => {
      const result = editingId === "new" ? await createServiceProfileAction(input) : await updateServiceProfileAction(editingId as string, input);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  function toggleActive(profile: NfseServiceProfile): void {
    startTransition(async () => {
      const result = profile.active ? await deactivateServiceProfileAction(profile.id) : await reactivateServiceProfileAction(profile.id);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="form-section form-section--first">
      <h2>Perfis de serviço</h2>
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {editingId === null ? (
        <div className="form-actions">
          <button type="button" className="form-action-primary" onClick={startCreate} disabled={pending}>
            Novo perfil
          </button>
        </div>
      ) : (
        <div className="form-grid" style={{ marginTop: "12px" }}>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Nome amigável</span>
            <input type="text" value={input.name} onChange={(event) => set("name", event.target.value)} placeholder="ex.: Publicidade" />
          </label>
          <label className="form-field">
            <span className="field-label">Código de tributação nacional (cTribNac)</span>
            <input type="text" value={input.cTribNac} onChange={(event) => set("cTribNac", event.target.value)} />
            <span className="helper-text">Usado pelo padrão nacional da NFS-e.</span>
          </label>
          <label className="form-field">
            <span className="field-label">Código de tributação municipal (cTribMun) <span className="field-optional">(opcional)</span></span>
            <input type="text" value={input.cTribMun} onChange={(event) => set("cTribMun", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">NBS (cNBS) <span className="field-optional">(opcional)</span></span>
            <input type="text" value={input.cNBS} onChange={(event) => set("cNBS", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Município padrão da prestação <span className="field-optional">(opcional)</span></span>
            <input type="text" value={input.defaultLocationMunicipality} onChange={(event) => set("defaultLocationMunicipality", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Código IBGE padrão <span className="field-optional">(opcional)</span></span>
            <input type="text" value={input.defaultLocationIbgeCode} onChange={(event) => set("defaultLocationIbgeCode", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Tributação do ISSQN <span className="field-optional">(opcional)</span></span>
            <input type="text" value={input.issqnTaxation} onChange={(event) => set("issqnTaxation", event.target.value)} placeholder="ex.: Tributado no município do prestador" />
          </label>
          <label className="form-field">
            <span className="field-label">Regime especial <span className="field-optional">(opcional)</span></span>
            <input type="text" value={input.specialTaxRegime} onChange={(event) => set("specialTaxRegime", event.target.value)} />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Observações internas <span className="field-optional">(opcional)</span></span>
            <textarea rows={2} value={input.notes} onChange={(event) => set("notes", event.target.value)} />
          </label>
          <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
            <button type="button" className="form-action-primary" onClick={save} disabled={pending}>
              {pending ? "Salvando…" : "Salvar perfil"}
            </button>
            <button type="button" onClick={cancel} disabled={pending}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {profiles.length === 0 ? (
        <p className="helper-text" style={{ marginTop: "12px" }}>
          Nenhum perfil de serviço cadastrado ainda.
        </p>
      ) : (
        <div className="materias-table-wrap" style={{ marginTop: "12px" }}>
          <table className="materias-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>cTribNac</th>
                <th>cTribMun</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id}>
                  <td>{profile.name}</td>
                  <td>{profile.cTribNac || "—"}</td>
                  <td>{profile.cTribMun || "—"}</td>
                  <td>
                    <span className={`status-pill ${profile.active ? "status-pill--published" : "status-pill--archived"}`}>
                      {profile.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>
                    <div className="form-actions">
                      <button type="button" onClick={() => startEdit(profile)} disabled={pending}>
                        Editar
                      </button>
                      <button type="button" onClick={() => toggleActive(profile)} disabled={pending}>
                        {profile.active ? "Desativar" : "Reativar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
