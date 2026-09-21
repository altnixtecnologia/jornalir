"use client";

import { useState, useTransition } from "react";
import type { Locality, LocalityScope } from "@ir/types";
import {
  createLocality,
  setLocalityActive,
  updateLocality,
  type LocalityPayload,
} from "../../app/sistema/editorial/localidades/actions";
import { localityScopeLabels } from "./editorialLabels";

interface LocalidadesManagerProps {
  localities: Locality[];
}

const SCOPE_OPTIONS: LocalityScope[] = ["city", "region", "general"];

const EMPTY_FORM: LocalityPayload = { name: "", slug: "", scope: "city" };

/**
 * Gestão de localidades (cidade/região/geral) — sempre independente da
 * editoria (Parte C do Plano Mestre). Organizada em uma tabela agrupada por
 * abrangência, com criação e edição sem sair da listagem.
 */
export function LocalidadesManager({ localities }: LocalidadesManagerProps): JSX.Element {
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<LocalityPayload>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<LocalityPayload>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sorted = [...localities].sort((a, b) => {
    if (a.scope !== b.scope) return SCOPE_OPTIONS.indexOf(a.scope) - SCOPE_OPTIONS.indexOf(b.scope);
    return a.name.localeCompare(b.name, "pt-BR");
  });

  function startEdit(locality: Locality): void {
    setError(null);
    setShowCreate(false);
    setEditingId(locality.id);
    setEditForm({ name: locality.name, slug: locality.slug, scope: locality.scope });
  }

  function handleCreate(): void {
    setError(null);
    startTransition(async () => {
      const result = await createLocality(createForm);
      if ("error" in result) {
        setError(result.error);
      } else {
        setCreateForm(EMPTY_FORM);
        setShowCreate(false);
      }
    });
  }

  function handleSaveEdit(id: string): void {
    setError(null);
    startTransition(async () => {
      const result = await updateLocality(id, editForm);
      if ("error" in result) setError(result.error);
      else setEditingId(null);
    });
  }

  function handleToggleActive(locality: Locality): void {
    setError(null);
    startTransition(async () => {
      const result = await setLocalityActive(locality.id, !locality.active);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <>
      <div className="materias-toolbar">
        <span className="materias-count">{localities.length} localidade(s)</span>
        <button
          type="button"
          className="header-action"
          onClick={() => {
            setShowCreate((value) => !value);
            setEditingId(null);
            setError(null);
          }}
        >
          {showCreate ? "Cancelar" : "Nova localidade ＋"}
        </button>
      </div>

      {showCreate ? (
        <div className="inline-form">
          <div className="form-grid">
            <label className="form-field">
              <span className="field-label">Nome</span>
              <input
                value={createForm.name}
                onChange={(event) => setCreateForm((form) => ({ ...form, name: event.target.value }))}
                placeholder="Ex.: Balneário Gaivota"
              />
            </label>
            <label className="form-field">
              <span className="field-label">Abrangência</span>
              <select
                value={createForm.scope}
                onChange={(event) =>
                  setCreateForm((form) => ({ ...form, scope: event.target.value as LocalityScope }))
                }
              >
                {SCOPE_OPTIONS.map((scope) => (
                  <option key={scope} value={scope}>
                    {localityScopeLabels[scope]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="form-field">
            <span className="field-label">
              Identificador <span className="field-optional">(opcional, gerado do nome)</span>
            </span>
            <input
              value={createForm.slug}
              onChange={(event) => setCreateForm((form) => ({ ...form, slug: event.target.value }))}
              placeholder="balneario-gaivota"
            />
          </label>
          <div className="form-actions">
            <button type="button" className="form-action-primary" onClick={handleCreate} disabled={pending}>
              Salvar localidade
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Abrangência</th>
              <th>Identificador</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((locality) => {
              const isEditing = editingId === locality.id;
              return (
                <tr key={locality.id}>
                  {isEditing ? (
                    <>
                      <td>
                        <input
                          value={editForm.name}
                          onChange={(event) => setEditForm((form) => ({ ...form, name: event.target.value }))}
                        />
                      </td>
                      <td>
                        <select
                          value={editForm.scope}
                          onChange={(event) =>
                            setEditForm((form) => ({ ...form, scope: event.target.value as LocalityScope }))
                          }
                        >
                          {SCOPE_OPTIONS.map((scope) => (
                            <option key={scope} value={scope}>
                              {localityScopeLabels[scope]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          value={editForm.slug}
                          onChange={(event) => setEditForm((form) => ({ ...form, slug: event.target.value }))}
                        />
                      </td>
                      <td>
                        <span className={`status-pill status-pill--${locality.active ? "published" : "archived"}`}>
                          {locality.active ? "Ativa" : "Inativa"}
                        </span>
                      </td>
                      <td>
                        <div className="candidate-row-actions">
                          <button type="button" onClick={() => handleSaveEdit(locality.id)} disabled={pending}>
                            Salvar
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} disabled={pending}>
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="materia-title">{locality.name}</td>
                      <td>{localityScopeLabels[locality.scope]}</td>
                      <td className="materia-reference">{locality.slug}</td>
                      <td>
                        <span className={`status-pill status-pill--${locality.active ? "published" : "archived"}`}>
                          {locality.active ? "Ativa" : "Inativa"}
                        </span>
                      </td>
                      <td>
                        <div className="candidate-row-actions">
                          <button type="button" onClick={() => startEdit(locality)} disabled={pending}>
                            Editar
                          </button>
                          <button type="button" onClick={() => handleToggleActive(locality)} disabled={pending}>
                            {locality.active ? "Inativar" : "Ativar"}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: nunca a tabela desktop espremida — cartões empilhados, mesma edição inline da tabela. */}
      <ul className="materias-cards">
        {sorted.map((locality) => {
          const isEditing = editingId === locality.id;
          return (
            <li key={locality.id} className="materia-card materia-card--static">
              {isEditing ? (
                <>
                  <label className="form-field">
                    <span className="field-label">Nome</span>
                    <input
                      value={editForm.name}
                      onChange={(event) => setEditForm((form) => ({ ...form, name: event.target.value }))}
                    />
                  </label>
                  <label className="form-field">
                    <span className="field-label">Abrangência</span>
                    <select
                      value={editForm.scope}
                      onChange={(event) =>
                        setEditForm((form) => ({ ...form, scope: event.target.value as LocalityScope }))
                      }
                    >
                      {SCOPE_OPTIONS.map((scope) => (
                        <option key={scope} value={scope}>
                          {localityScopeLabels[scope]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span className="field-label">Identificador</span>
                    <input
                      value={editForm.slug}
                      onChange={(event) => setEditForm((form) => ({ ...form, slug: event.target.value }))}
                    />
                  </label>
                  <div className="form-actions">
                    <button type="button" onClick={() => handleSaveEdit(locality.id)} disabled={pending}>
                      Salvar
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} disabled={pending}>
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="materia-card-head">
                    <span className={`status-pill status-pill--${locality.active ? "published" : "archived"}`}>
                      {locality.active ? "Ativa" : "Inativa"}
                    </span>
                    <span className="materia-reference">{locality.slug}</span>
                  </div>
                  <span className="materia-card-title">{locality.name}</span>
                  <span className="materia-subtitle">{localityScopeLabels[locality.scope]}</span>
                  <div className="materia-card-foot">
                    <button type="button" onClick={() => startEdit(locality)} disabled={pending}>
                      Editar
                    </button>
                    <button type="button" onClick={() => handleToggleActive(locality)} disabled={pending}>
                      {locality.active ? "Inativar" : "Ativar"}
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
