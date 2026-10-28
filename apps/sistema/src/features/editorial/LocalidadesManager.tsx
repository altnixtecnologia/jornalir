"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locality, LocalityScope } from "@ir/types";
import {
  createLocality, setLocalityActive, updateLocality, type LocalityPayload,
} from "../../app/sistema/editorial/localidades/actions";
import { localityScopeLabels } from "./editorialLabels";
import { UFS } from "./geoStates";
import { notify } from "../../lib/feedback/notify";

interface Props { localities: Locality[] }
type ScopeFilter = "all" | LocalityScope;



const SCOPE_OPTIONS: LocalityScope[] = ["city", "state", "region", "country", "general"];
const EMPTY: LocalityPayload = { name: "", slug: "", scope: "city", stateCode: null };
const TOP_SLUGS = ["santa-catarina", "rio-grande-do-sul", "brasil"];

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function audienceText(locality: Pick<LocalityPayload, "scope" | "stateCode">): string {
  switch (locality.scope) {
    case "city": return "Apenas quem acompanha esta cidade (e quem escolheu receber tudo).";
    case "state": return "Leitores que acompanham cidades de " + (locality.stateCode || "sua UF") + " (e quem recebe tudo).";
    case "region": return "Abrangência regional: envio amplo, conforme as regras acordadas.";
    case "country": return "Brasil: aviso nacional para todos os inscritos no tipo correspondente.";
    default: return "Abrangência geral: aviso para todos os inscritos no tipo correspondente.";
  }
}
function localName(locality: Locality): string {
  return locality.name + (locality.stateCode && locality.scope === "city" ? " · " + locality.stateCode : "");
}
function scopeOrder(scope: LocalityScope): number {
  return ({state: 0, country: 1, region: 2, city: 3, general: 4} satisfies Record<LocalityScope,number>)[scope];
}

function Editor({
  form, setForm, busy, label, onSave, onClose,
}: {
  form: LocalityPayload;
  setForm: (value: LocalityPayload) => void;
  busy: boolean;
  label: string;
  onSave: () => void;
  onClose: () => void;
}): JSX.Element {
  const needsUf = form.scope === "city" || form.scope === "state";
  return (
    <form className="geo-editor" onSubmit={(event) => { event.preventDefault(); if (!busy) onSave(); }}>
      <div className="geo-editor-head">
        <strong>{label}</strong>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Fechar formulário">×</button>
      </div>
      <div className="geo-form-grid">
        <label className="geo-field geo-name">
          <span>Nome da abrangência</span>
          <input required maxLength={120} value={form.name}
            placeholder={form.scope === "city" ? "Ex.: Passo de Torres" : "Ex.: Santa Catarina"}
            onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label className="geo-field">
          <span>Tipo</span>
          <select value={form.scope} onChange={(event) => {
            const scope = event.target.value as LocalityScope;
            setForm({ ...form, scope, stateCode: scope === "city" || scope === "state" ? form.stateCode : null });
          }}>
            {SCOPE_OPTIONS.map((scope) => (
              <option key={scope} value={scope}>{localityScopeLabels[scope]}</option>
            ))}
          </select>
        </label>
        {needsUf ? (
          <label className="geo-field">
            <span>Estado (UF)</span>
            <select required value={form.stateCode || ""} onChange={(event) => setForm({ ...form, stateCode: event.target.value })}>
              <option value="" disabled>Selecione o estado</option>
              {UFS.map((uf) => <option key={uf.code} value={uf.code}>{uf.code} · {uf.name}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      <div className="geo-destination-preview">
        <strong>Quem receberá o aviso?</strong>
        <span>{audienceText(form)}</span>
        <small>Prévia da regra planejada; o filtro geográfico de entregas será ativado em etapa própria.</small>
      </div>
      <details className="geo-advanced">
        <summary>Opções avançadas: identificador</summary>
        <label className="geo-field">
          <span>Identificador da URL</span>
          <input value={form.slug ?? ""} maxLength={160}
            placeholder="Gerado automaticamente, incluindo UF para cidades novas"
            onChange={(event) => setForm({ ...form, slug: event.target.value })} />
        </label>
        <small>Evite mudar o identificador de uma abrangência já usada por matérias.</small>
      </details>
      <div className="geo-form-actions">
        <button type="submit" className="geo-save" disabled={busy || !form.name.trim() || (needsUf && !form.stateCode)}>
          {busy ? "Salvando..." : "Salvar"}
        </button>
        <button type="button" className="geo-close" disabled={busy} onClick={onClose}>Fechar</button>
      </div>
    </form>
  );
}

export function LocalidadesManager({ localities }: Props): JSX.Element {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LocalityPayload>(EMPTY);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ScopeFilter>("all");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const top = TOP_SLUGS.map((slug) => localities.find((locality) => locality.slug === slug)).filter((value): value is Locality => Boolean(value));
  const filtered = useMemo(() => localities.filter((item) => {
    if (filter !== "all" && item.scope !== filter) return false;
    if (query && !normalizeText(item.name + " " + item.slug + " " + (item.stateCode || "")).includes(normalizeText(query.trim()))) return false;
    return true;
  }).sort((a, b) => {
    // Fixar SC/RS/Brasil no inicio; novas cidades ficam em ordem alfabética.
    const aTop = TOP_SLUGS.indexOf(a.slug);
    const bTop = TOP_SLUGS.indexOf(b.slug);
    if (aTop !== -1 || bTop !== -1) return (aTop === -1 ? 99 : aTop) - (bTop === -1 ? 99 : bTop);
    const diff = scopeOrder(a.scope) - scopeOrder(b.scope);
    return diff || a.name.localeCompare(b.name, "pt-BR");
  }), [filter, localities, query]);

  function close(): void {
    setCreating(false);
    setEditingId(null);
  }
  function startCreate(): void {
    setForm({ ...EMPTY }); setCreating(true); setEditingId(null);
  }
  function startEdit(locality: Locality): void {
    setForm({name:locality.name,slug:locality.slug,scope:locality.scope,stateCode:locality.stateCode ?? null});
    setEditingId(locality.id); setCreating(false);
  }
  async function save(): Promise<void> {
    if (pending) return;
    const wasCreating = !editingId;
    setPending(true);
    try {
      const result = editingId ? await updateLocality(editingId, form) : await createLocality(form);
      if ("error" in result) {
        notify.error("Não foi possível salvar", result.error);
      } else {
        notify.success(wasCreating ? "Abrangência criada" : "Abrangência atualizada",
          wasCreating ? "A abrangência foi criada." : "As alterações foram salvas.");
        close(); router.refresh();
      }
    } catch {
      notify.error("Não foi possível salvar", "Não foi possível salvar. Tente novamente.");
    } finally { setPending(false); }
  }
  async function toggle(locality: Locality): Promise<void> {
    if (pending) return;
    setPending(true);
    try {
      const result = await setLocalityActive(locality.id, !locality.active);
      if ("error" in result) {
        notify.error("Não foi possível alterar o status", result.error);
      } else {
        notify.success(locality.active ? "Abrangência desativada" : "Abrangência ativada",
          locality.name + (locality.active ? " foi desativada." : " foi ativada."));
        router.refresh();
      }
    } catch {
      notify.error("Não foi possível alterar o status", "Não foi possível alterar o status. Tente novamente.");
    } finally { setPending(false); }
  }

  return (
    <section className="geo-manager" aria-label="Gerenciar abrangências">
      <div className="geo-toolbar">
        <div>
          <strong>{localities.length} abrangências cadastradas</strong>
          <small>Cidades, estados e coberturas amplas do Jornal IR.</small>
        </div>
        <button type="button" className="geo-new" onClick={() => creating ? close() : startCreate()}>
          {creating ? "Fechar" : "+ Nova"}
        </button>
      </div>

      <div className="geo-broad" aria-label="Abrangências amplas iniciais">
        {top.map((locality) => (
          <div key={locality.id} className="geo-broad-item">
            <span>{locality.scope === "state" ? locality.stateCode || (locality.slug === "santa-catarina" ? "SC" : "RS") : "BR"}</span>
            <div><strong>{locality.name}</strong><small>{locality.active ? "Ativa" : "Inativa"} · {localityScopeLabels[locality.scope]}</small></div>
            <button type="button" disabled={pending} aria-label={"Editar " + locality.name} onClick={() => startEdit(locality)}>Editar</button>
          </div>
        ))}
      </div>

      {(creating || editingId) ? (
        <Editor form={form} setForm={setForm} busy={pending}
          label={creating ? "Nova abrangência" : "Editar abrangência"} onSave={save} onClose={close} />
      ) : null}

      <div className="geo-find">
        <input type="search" aria-label="Buscar abrangências" value={query}
          placeholder="Buscar cidade, região ou UF" onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="Filtrar por tipo" value={filter} onChange={(event) => setFilter(event.target.value as ScopeFilter)}>
          <option value="all">Todos os tipos</option>
          {SCOPE_OPTIONS.map((scope) => <option key={scope} value={scope}>{localityScopeLabels[scope]}</option>)}
        </select>
      </div>

      <div className="geo-list" role="list" aria-label="Abrangências existentes">
        {filtered.map((locality) => (
          <div className={"geo-list-item" + (editingId === locality.id ? " is-editing" : "")} role="listitem" key={locality.id}>
            <div className="geo-list-main">
              <strong>{localName(locality)}</strong>
              <span>{localityScopeLabels[locality.scope]}{locality.scope === "general" ? " · histórico" : ""}</span>
            </div>
            <span className={"geo-state " + (locality.active ? "is-active" : "")}>{locality.active ? "Ativa" : "Inativa"}</span>
            <div className="geo-list-actions">
              <button type="button" disabled={pending} onClick={() => startEdit(locality)}>Editar</button>
              <button type="button" disabled={pending} onClick={() => toggle(locality)}>
                {locality.active ? "Inativar" : "Ativar"}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 ? <p className="geo-empty">Nenhuma abrangência encontrada com esse filtro.</p> : null}
      </div>
      <small className="geo-footnote">
        A abrangência “Geral” foi preservada porque há matérias antigas vinculadas a ela.
        Novos registros podem ser direcionados por cidade, SC, RS ou Brasil.
      </small>
    </section>
  );
}
