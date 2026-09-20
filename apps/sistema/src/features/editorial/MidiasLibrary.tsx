"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { MediaAsset } from "@ir/types";
import { registerMedia, updateMedia, type MediaAssetPayload } from "../../app/sistema/editorial/midias/actions";

export interface MediaUsageRef {
  id: string;
  title: string;
}

interface MidiasLibraryProps {
  mediaAssets: MediaAsset[];
  usageByMediaId: Record<string, MediaUsageRef[]>;
}

type LinkFilter = "all" | "linked" | "unlinked";

const EMPTY_FORM: MediaAssetPayload = { name: "", url: "", altText: "", caption: "", credit: "", capturedAt: "" };

function toFormValues(asset: MediaAsset): MediaAssetPayload {
  return {
    name: asset.name,
    url: asset.url,
    altText: asset.altText ?? "",
    caption: asset.caption ?? "",
    credit: asset.credit ?? "",
    capturedAt: asset.capturedAt ?? "",
  };
}

/**
 * Biblioteca de mídia: visualizar, pesquisar, filtrar e selecionar (para ver
 * detalhe/editar metadados). Sem storage real nesta fase — cadastrar uma
 * mídia cataloga uma URL já hospedada, nunca recebe um arquivo.
 */
export function MidiasLibrary({ mediaAssets, usageByMediaId }: MidiasLibraryProps): JSX.Element {
  const [search, setSearch] = useState("");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<MediaAssetPayload>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<MediaAssetPayload>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return mediaAssets.filter((asset) => {
      const linkedCount = usageByMediaId[asset.id]?.length ?? 0;
      if (linkFilter === "linked" && linkedCount === 0) return false;
      if (linkFilter === "unlinked" && linkedCount > 0) return false;
      if (term) {
        const haystack = `${asset.name} ${asset.reference} ${asset.caption ?? ""} ${asset.credit ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [mediaAssets, search, linkFilter, usageByMediaId]);

  const selected = mediaAssets.find((asset) => asset.id === selectedId) ?? null;
  const selectedUsage = selected ? usageByMediaId[selected.id] ?? [] : [];

  function selectAsset(asset: MediaAsset): void {
    setSelectedId(asset.id);
    setShowCreate(false);
    setEditForm(toFormValues(asset));
    setError(null);
    setSavedMessage(null);
  }

  function handleCreate(): void {
    setError(null);
    setSavedMessage(null);
    startTransition(async () => {
      const result = await registerMedia(createForm);
      if ("error" in result) {
        setError(result.error);
      } else {
        setCreateForm(EMPTY_FORM);
        setShowCreate(false);
        setSavedMessage(`Mídia "${result.asset.name}" cadastrada.`);
      }
    });
  }

  function handleSaveEdit(): void {
    if (!selected) return;
    setError(null);
    setSavedMessage(null);
    startTransition(async () => {
      const result = await updateMedia(selected.id, editForm);
      if ("error" in result) setError(result.error);
      else setSavedMessage("Alterações salvas.");
    });
  }

  return (
    <>
      <div className="materias-toolbar">
        <div className="materias-filters">
          <label className="materias-search">
            Pesquisar
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome, referência, legenda ou crédito"
            />
          </label>
          <label>
            Vínculo
            <select value={linkFilter} onChange={(event) => setLinkFilter(event.target.value as LinkFilter)}>
              <option value="all">Todas</option>
              <option value="linked">Vinculada a matéria</option>
              <option value="unlinked">Sem vínculo</option>
            </select>
          </label>
        </div>
        <span className="materias-count">
          {filtered.length} de {mediaAssets.length} mídia(s)
        </span>
        <button
          type="button"
          className="header-action"
          onClick={() => {
            setShowCreate((value) => !value);
            setSelectedId(null);
            setError(null);
          }}
        >
          {showCreate ? "Cancelar" : "Nova mídia ＋"}
        </button>
      </div>

      {showCreate ? (
        <div className="inline-form">
          <p className="helper-text">
            Sem storage real nesta fase — informe a URL de uma imagem já hospedada.
          </p>
          <div className="form-grid">
            <label className="form-field">
              <span className="field-label">Nome</span>
              <input
                value={createForm.name}
                onChange={(event) => setCreateForm((form) => ({ ...form, name: event.target.value }))}
                placeholder="Ex.: Festival regional — capa"
              />
            </label>
            <label className="form-field">
              <span className="field-label">URL da imagem</span>
              <input
                value={createForm.url}
                onChange={(event) => setCreateForm((form) => ({ ...form, url: event.target.value }))}
                placeholder="https://…"
              />
            </label>
          </div>
          <div className="form-grid">
            <label className="form-field">
              <span className="field-label">
                Legenda padrão <span className="field-optional">(opcional)</span>
              </span>
              <input
                value={createForm.caption}
                onChange={(event) => setCreateForm((form) => ({ ...form, caption: event.target.value }))}
              />
            </label>
            <label className="form-field">
              <span className="field-label">
                Crédito <span className="field-optional">(opcional)</span>
              </span>
              <input
                value={createForm.credit}
                onChange={(event) => setCreateForm((form) => ({ ...form, credit: event.target.value }))}
                placeholder="Fotógrafo ou fonte"
              />
            </label>
          </div>
          <div className="form-grid">
            <label className="form-field">
              <span className="field-label">
                Texto alternativo <span className="field-optional">(acessibilidade, opcional)</span>
              </span>
              <input
                value={createForm.altText}
                onChange={(event) => setCreateForm((form) => ({ ...form, altText: event.target.value }))}
              />
            </label>
            <label className="form-field">
              <span className="field-label">
                Data da foto <span className="field-optional">(opcional)</span>
              </span>
              <input
                type="date"
                value={createForm.capturedAt}
                onChange={(event) => setCreateForm((form) => ({ ...form, capturedAt: event.target.value }))}
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="form-action-primary" onClick={handleCreate} disabled={pending}>
              Cadastrar mídia
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {savedMessage && !error ? <p className="helper-text">{savedMessage}</p> : null}

      <div className="media-library-layout">
        {filtered.length === 0 ? (
          <div className="materias-empty">Nenhuma mídia encontrada com os filtros atuais.</div>
        ) : (
          <div className="library-grid">
            {filtered.map((asset) => {
              const linkedCount = usageByMediaId[asset.id]?.length ?? 0;
              return (
                <button
                  type="button"
                  key={asset.id}
                  className={`library-item media-library-item${selectedId === asset.id ? " is-selected" : ""}`}
                  onClick={() => selectAsset(asset)}
                >
                  <img src={asset.url} alt={asset.altText ?? asset.reference} />
                  <span className="materia-title">{asset.name}</span>
                  <span className="materia-reference">{asset.reference}</span>
                  <span className={`media-indicator${linkedCount > 0 ? " media-indicator--cover" : ""}`}>
                    {linkedCount > 0 ? `Em uso (${linkedCount})` : "Sem vínculo"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {selected ? (
          <aside className="media-detail-panel" aria-labelledby="media-detail-title">
            <h2 id="media-detail-title">{selected.name}</h2>
            <img src={selected.url} alt={selected.altText ?? selected.reference} />
            <p className="materia-reference">{selected.reference}</p>

            <label className="form-field">
              <span className="field-label">Nome</span>
              <input
                value={editForm.name}
                onChange={(event) => setEditForm((form) => ({ ...form, name: event.target.value }))}
              />
            </label>
            <label className="form-field">
              <span className="field-label">URL da imagem</span>
              <input
                value={editForm.url}
                onChange={(event) => setEditForm((form) => ({ ...form, url: event.target.value }))}
              />
            </label>
            <label className="form-field">
              <span className="field-label">
                Legenda padrão <span className="field-optional">(opcional)</span>
              </span>
              <input
                value={editForm.caption}
                onChange={(event) => setEditForm((form) => ({ ...form, caption: event.target.value }))}
              />
            </label>
            <label className="form-field">
              <span className="field-label">
                Crédito <span className="field-optional">(opcional)</span>
              </span>
              <input
                value={editForm.credit}
                onChange={(event) => setEditForm((form) => ({ ...form, credit: event.target.value }))}
              />
            </label>
            <label className="form-field">
              <span className="field-label">
                Texto alternativo <span className="field-optional">(opcional)</span>
              </span>
              <input
                value={editForm.altText}
                onChange={(event) => setEditForm((form) => ({ ...form, altText: event.target.value }))}
              />
            </label>
            <label className="form-field">
              <span className="field-label">
                Data da foto <span className="field-optional">(opcional)</span>
              </span>
              <input
                type="date"
                value={editForm.capturedAt}
                onChange={(event) => setEditForm((form) => ({ ...form, capturedAt: event.target.value }))}
              />
            </label>
            <div className="form-actions">
              <button type="button" className="form-action-primary" onClick={handleSaveEdit} disabled={pending}>
                Salvar alterações
              </button>
            </div>

            <div className="form-field">
              <span className="field-label">Usada em</span>
              {selectedUsage.length === 0 ? (
                <p className="helper-text">Nenhuma matéria usa esta mídia ainda.</p>
              ) : (
                <ul className="media-usage-list">
                  {selectedUsage.map((usage) => (
                    <li key={usage.id}>
                      <Link className="materia-open-link" href={`/sistema/editorial/materias/${usage.id}`}>
                        {usage.title} ↗
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </>
  );
}
