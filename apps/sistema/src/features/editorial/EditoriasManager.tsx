"use client";

import { useState, useTransition } from "react";
import type { EditorialSection } from "@ir/types";
import {
  createSection,
  reorderSections,
  setSectionActive,
  updateSection,
  type EditorialSectionPayload,
} from "../../app/sistema/editorial/editorias/actions";

interface EditoriasManagerProps {
  sections: EditorialSection[];
}

const EMPTY_FORM: EditorialSectionPayload = { name: "", slug: "", description: "" };

/**
 * Gestão de editorias (assuntos) — nunca hardcoded na interface, sempre a
 * partir de `EditorialSectionService`. Criação e edição acontecem sem sair
 * da listagem (poucos cliques): criar abre um formulário compacto no topo;
 * editar transforma a própria linha da tabela em campos editáveis.
 */
export function EditoriasManager({ sections }: EditoriasManagerProps): JSX.Element {
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<EditorialSectionPayload>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditorialSectionPayload>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sorted = [...sections].sort((a, b) => a.order - b.order);

  function startEdit(section: EditorialSection): void {
    setError(null);
    setShowCreate(false);
    setEditingId(section.id);
    setEditForm({ name: section.name, slug: section.slug, description: section.description ?? "" });
  }

  function handleCreate(): void {
    setError(null);
    startTransition(async () => {
      const result = await createSection(createForm);
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
      const result = await updateSection(id, editForm);
      if ("error" in result) setError(result.error);
      else setEditingId(null);
    });
  }

  function handleToggleActive(section: EditorialSection): void {
    setError(null);
    startTransition(async () => {
      const result = await setSectionActive(section.id, !section.active);
      if ("error" in result) setError(result.error);
    });
  }

  function handleMove(index: number, direction: -1 | 1): void {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    const reordered = [...sorted];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    setError(null);
    startTransition(async () => {
      const result = await reorderSections(reordered.map((section) => section.id));
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <>
      <div className="materias-toolbar">
        <span className="materias-count">{sections.length} editoria(s)</span>
        <button
          type="button"
          className="header-action"
          onClick={() => {
            setShowCreate((value) => !value);
            setEditingId(null);
            setError(null);
          }}
        >
          {showCreate ? "Cancelar" : "Nova editoria ＋"}
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
                placeholder="Ex.: Cultura"
              />
            </label>
            <label className="form-field">
              <span className="field-label">
                Identificador <span className="field-optional">(opcional, gerado do nome)</span>
              </span>
              <input
                value={createForm.slug}
                onChange={(event) => setCreateForm((form) => ({ ...form, slug: event.target.value }))}
                placeholder="cultura"
              />
            </label>
          </div>
          <label className="form-field">
            <span className="field-label">
              Descrição <span className="field-optional">(opcional)</span>
            </span>
            <input
              value={createForm.description}
              onChange={(event) => setCreateForm((form) => ({ ...form, description: event.target.value }))}
            />
          </label>
          <div className="form-actions">
            <button type="button" className="form-action-primary" onClick={handleCreate} disabled={pending}>
              Salvar editoria
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
              <th>Ordem</th>
              <th>Nome</th>
              <th>Identificador</th>
              <th>Descrição</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((section, index) => {
              const isEditing = editingId === section.id;
              return (
                <tr key={section.id}>
                  <td>
                    <div className="reorder-buttons">
                      <button
                        type="button"
                        onClick={() => handleMove(index, -1)}
                        disabled={pending || index === 0}
                        aria-label={`Mover ${section.name} para cima`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(index, 1)}
                        disabled={pending || index === sorted.length - 1}
                        aria-label={`Mover ${section.name} para baixo`}
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  {isEditing ? (
                    <>
                      <td>
                        <input
                          value={editForm.name}
                          onChange={(event) => setEditForm((form) => ({ ...form, name: event.target.value }))}
                        />
                      </td>
                      <td>
                        <input
                          value={editForm.slug}
                          onChange={(event) => setEditForm((form) => ({ ...form, slug: event.target.value }))}
                        />
                      </td>
                      <td>
                        <input
                          value={editForm.description}
                          onChange={(event) =>
                            setEditForm((form) => ({ ...form, description: event.target.value }))
                          }
                        />
                      </td>
                      <td>
                        <span className={`status-pill status-pill--${section.active ? "published" : "archived"}`}>
                          {section.active ? "Ativa" : "Inativa"}
                        </span>
                      </td>
                      <td>
                        <div className="candidate-row-actions">
                          <button type="button" onClick={() => handleSaveEdit(section.id)} disabled={pending}>
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
                      <td className="materia-title">{section.name}</td>
                      <td className="materia-reference">{section.slug}</td>
                      <td>{section.description ?? "—"}</td>
                      <td>
                        <span className={`status-pill status-pill--${section.active ? "published" : "archived"}`}>
                          {section.active ? "Ativa" : "Inativa"}
                        </span>
                      </td>
                      <td>
                        <div className="candidate-row-actions">
                          <button type="button" onClick={() => startEdit(section)} disabled={pending}>
                            Editar
                          </button>
                          <button type="button" onClick={() => handleToggleActive(section)} disabled={pending}>
                            {section.active ? "Inativar" : "Ativar"}
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
        {sorted.map((section, index) => {
          const isEditing = editingId === section.id;
          return (
            <li key={section.id} className="materia-card materia-card--static">
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
                    <span className="field-label">Identificador</span>
                    <input
                      value={editForm.slug}
                      onChange={(event) => setEditForm((form) => ({ ...form, slug: event.target.value }))}
                    />
                  </label>
                  <label className="form-field">
                    <span className="field-label">Descrição</span>
                    <input
                      value={editForm.description}
                      onChange={(event) => setEditForm((form) => ({ ...form, description: event.target.value }))}
                    />
                  </label>
                  <div className="form-actions">
                    <button type="button" onClick={() => handleSaveEdit(section.id)} disabled={pending}>
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
                    <span className={`status-pill status-pill--${section.active ? "published" : "archived"}`}>
                      {section.active ? "Ativa" : "Inativa"}
                    </span>
                    <span className="materia-reference">{section.slug}</span>
                  </div>
                  <span className="materia-card-title">{section.name}</span>
                  {section.description ? <span className="materia-subtitle">{section.description}</span> : null}
                  <div className="materia-card-foot">
                    <div className="reorder-buttons">
                      <button
                        type="button"
                        onClick={() => handleMove(index, -1)}
                        disabled={pending || index === 0}
                        aria-label={`Mover ${section.name} para cima`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(index, 1)}
                        disabled={pending || index === sorted.length - 1}
                        aria-label={`Mover ${section.name} para baixo`}
                      >
                        ↓
                      </button>
                    </div>
                    <button type="button" onClick={() => startEdit(section)} disabled={pending}>
                      Editar
                    </button>
                    <button type="button" onClick={() => handleToggleActive(section)} disabled={pending}>
                      {section.active ? "Inativar" : "Ativar"}
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
