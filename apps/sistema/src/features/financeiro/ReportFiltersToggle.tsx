"use client";

import { useState } from "react";

/**
 * Painel de filtros recolhível (Parte 3B, item 10) — mesmo padrão já
 * usado em Matérias (materias-filters-toggle-row/materias-toolbar-compact):
 * fechado por padrão, principalmente para não tomar a tela inteira no
 * mobile. O form em si continua sendo renderizado pelo componente pai
 * (server component) e só é passado aqui como children — este wrapper
 * só controla a exibição.
 */
export function ReportFiltersToggle({
  activeFilterCount,
  children,
}: {
  activeFilterCount: number;
  children: React.ReactNode;
}): JSX.Element {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <>
      <div className="materias-filters-toggle-row">
        <button
          type="button"
          className="materias-filters-toggle"
          aria-expanded={filtersOpen}
          aria-controls="relatorios-filters-panel"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          {filtersOpen ? "Fechar filtros" : "Filtros"}
          {!filtersOpen && activeFilterCount > 0 ? (
            <span className="materias-filters-badge" aria-label={`${activeFilterCount} filtro(s) ativo(s)`}>
              {activeFilterCount}
            </span>
          ) : null}
        </button>
      </div>
      <div id="relatorios-filters-panel" className={`materias-toolbar-compact${filtersOpen ? " is-open" : ""}`}>
        {children}
      </div>
    </>
  );
}
