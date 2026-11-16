"use client";

import { useId, useMemo, useState, type JSX, type KeyboardEvent } from "react";
import { matchMunicipalities } from "./municipalityAutocomplete";

let brazilianMunicipalitiesPromise: Promise<string[]> | undefined;

function loadMunicipalities(): Promise<string[]> {
  if (!brazilianMunicipalitiesPromise) {
    brazilianMunicipalitiesPromise = fetch("/api/localidades/municipios")
      .then(async (response) => {
        if (!response.ok) throw new Error("IBGE indisponível");
        const json: unknown = await response.json();
        if (!json || typeof json !== "object" || !("cities" in json)) throw new Error("Resposta inválida");
        const list = (json as { cities: unknown }).cities;
        if (!Array.isArray(list) || list.length < 5000 || !list.every((x) => typeof x === "string")) {
          throw new Error("Lista incompleta");
        }
        return list as string[];
      })
      .catch((error: unknown) => {
        // Falhas transitórias não são memorizadas permanentemente; é permitido
        // digitar manualmente e tentar novamente ao focar o campo.
        brazilianMunicipalitiesPromise = undefined;
        throw error;
      });
  }
  return brazilianMunicipalitiesPromise;
}

export function BirthdayCityAutocomplete({
  value, onChange, label = "Cidade", className = "cadastro-field cadastro-field--span-3",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}): JSX.Element {
  const uniqueId = useId().replace(/:/g, "");
  const [cities, setCities] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = useMemo(() => matchMunicipalities(cities, value), [cities, value]);
  const showSuggestions = open && suggestions.length > 0;

  function onFocus(): void {
    setOpen(true);
    if (cities.length) return;
    setLoading(true);
    void loadMunicipalities().then((list) => {
      setCities(list);
      setUnavailable(false);
    }).catch(() => setUnavailable(true)).finally(() => setLoading(false));
  }

  function selectCity(city: string): void {
    onChange(city);
    setActive(-1);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      setOpen(false); setActive(-1);
    } else if (event.key === "ArrowDown" && showSuggestions) {
      event.preventDefault();
      setActive((previous) => Math.min(previous + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp" && showSuggestions) {
      event.preventDefault();
      setActive((previous) => Math.max(previous - 1, 0));
    } else if (event.key === "Enter" && showSuggestions && active >= 0) {
      event.preventDefault();
      selectCity(suggestions[active]);
    }
  }

  return (
    <label className={className} style={{ position: "relative" }}>
      <span className="field-label">{label}</span>
      <input
        type="text" value={value} autoComplete="off"
        role="combobox" aria-autocomplete="list"
        aria-controls={uniqueId} aria-expanded={showSuggestions}
        aria-activedescendant={showSuggestions && active >= 0 ? `${uniqueId}-${active}` : undefined}
        placeholder="Digite a cidade (ex.: São João do Sul)"
        onChange={(e) => { onChange(e.target.value); setActive(-1); setOpen(true); }}
        onFocus={onFocus}
        onBlur={() => { setOpen(false); setActive(-1); }}
        onKeyDown={onKeyDown}
      />
      {showSuggestions ? (
        <ul id={uniqueId} role="listbox" className="birthday-city-suggestions">
          {suggestions.map((city, i) => (
            <li key={city} id={`${uniqueId}-${i}`} role="option"
              aria-selected={active === i}>
              <button type="button" className={active === i ? "is-active" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectCity(city)}>
                {city}
              </button>
            </li>
          ))}
        </ul>
      ) : <span id={uniqueId} hidden />}
      {loading ? <span className="helper-text">Carregando municípios do IBGE…</span> : null}
      {unavailable ? <span className="helper-text">Lista temporariamente indisponível; é possível digitar a cidade manualmente.</span> : null}
    </label>
  );
}
