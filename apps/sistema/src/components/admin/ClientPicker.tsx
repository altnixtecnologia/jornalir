"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { searchClientsAction } from "./clientSearchAction";
import type { ClientSearchResult } from "./clientSearchTypes";

const KIND_BADGE: Record<ClientSearchResult["kind"], string> = { individual: "PF", company: "PJ" };

/**
 * Seletor único de Cadastro — substitui a dupla "Buscar cliente" + "Cliente"
 * (select com todo mundo carregado) por UM campo só. Busca no servidor
 * (searchClientsAction): nome tolera acento/erro pequeno, CPF/CNPJ/
 * referência são exatos/determinísticos. "Cadastro não encontrado" oferece
 * "+ Novo cadastro" (sem fluxo de retorno automático — não existe
 * mecanismo de returnTo no projeto, não foi inventado um agora).
 */
export function ClientPicker({
  selected,
  onSelect,
  disabled = false,
  helperText,
}: {
  selected: ClientSearchResult | null;
  onSelect: (client: ClientSearchResult | null) => void;
  disabled?: boolean;
  helperText?: string;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      setSearched(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      searchClientsAction(term)
        .then((found) => setResults(found))
        .finally(() => {
          setLoading(false);
          setSearched(true);
        });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  if (selected) {
    return (
      <div className="client-picker">
        <span className="field-label">Cadastro</span>
        <div className="client-picker-selected-row">
          <p className="client-picker-selected">
            {selected.displayName} <span className="cadastro-role-badge">{KIND_BADGE[selected.kind]}</span>
            <br />
            <span className="helper-text">{selected.document || "sem documento"} · {selected.reference}</span>
          </p>
          {!disabled ? (
            <button
              type="button"
              className="cadastros-btn-secondary"
              onClick={() => {
                onSelect(null);
                setQuery("");
              }}
            >
              Trocar
            </button>
          ) : null}
        </div>
        {helperText ? <span className="helper-text">{helperText}</span> : null}
      </div>
    );
  }

  return (
    <div
      className="client-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label className="field-label" htmlFor="client-picker-input">
        Cadastro
      </label>
      <input
        id="client-picker-input"
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Nome, razão social, CPF, CNPJ ou referência"
        autoComplete="off"
        disabled={disabled}
      />
      {open && query.trim() ? (
        <div className="client-picker-results">
          {loading ? <p className="helper-text">Buscando…</p> : null}
          {!loading && searched && results.length === 0 ? (
            <div className="client-picker-empty">
              <p className="helper-text">Nenhum cadastro encontrado para &ldquo;{query.trim()}&rdquo;.</p>
              <Link className="cadastros-btn-secondary" href="/sistema/clientes/novo">
                + Novo cadastro
              </Link>
            </div>
          ) : null}
          {results.map((client) => (
            <button
              key={client.id}
              type="button"
              className="client-picker-result"
              onClick={() => {
                onSelect(client);
                setQuery("");
                setOpen(false);
              }}
            >
              <span className="client-picker-result-name">
                {client.displayName} <span className="cadastro-role-badge">{KIND_BADGE[client.kind]}</span>
              </span>
              <span className="helper-text">{client.document || "sem documento"} · {client.reference}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
