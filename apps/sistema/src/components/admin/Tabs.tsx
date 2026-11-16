"use client";

import { useState, type JSX, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Abas genéricas do painel — reutilizável, mas pensado para entidades com
 * grupos reais de informação (não para toda tela simples). Todos os
 * painéis ficam montados o tempo todo (`hidden`, nunca desmontados): troca
 * de aba nunca perde valor digitado, e o estado de verdade mora no
 * componente pai de qualquer forma (useState do formulário), nunca aqui.
 */
export function Tabs({
  tabs, defaultTabId, showStepNavigation = false,
}: { tabs: TabItem[]; defaultTabId?: string; showStepNavigation?: boolean }): JSX.Element {
  const [activeId, setActiveId] = useState(defaultTabId ?? tabs[0]?.id);

  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeId));

  function changeStep(nextIndex: number): void {
    const target = tabs[nextIndex];
    if (!target) return;
    setActiveId(target.id);
    focusTab(target.id);
  }

  function focusTab(id: string): void {
    document.getElementById(`tab-${id}`)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + direction + tabs.length) % tabs.length;
    setActiveId(tabs[next].id);
    focusTab(tabs[next].id);
  }

  return (
    <div className="ir-tabs">
      <div className="ir-tabs-list" role="tablist" aria-label="Seções do cadastro">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeId === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={activeId === tab.id ? 0 : -1}
            className={`ir-tab${activeId === tab.id ? " is-active" : ""}`}
            onClick={() => setActiveId(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} id={`tabpanel-${tab.id}`} role="tabpanel" aria-labelledby={`tab-${tab.id}`} hidden={activeId !== tab.id}>
          {tab.content}
        </div>
      ))}
      {showStepNavigation && tabs.length > 1 ? (
        <nav className="ir-tabs-step-navigation" aria-label="Navegação entre etapas">
          <button type="button" onClick={() => changeStep(activeIndex - 1)}
            disabled={activeIndex === 0} aria-label="Voltar à etapa anterior">
            ← Anterior
          </button>
          <span className="ir-tabs-step-navigation-status" aria-live="polite">
            Etapa {activeIndex + 1} de {tabs.length}
          </span>
          <button type="button" onClick={() => changeStep(activeIndex + 1)}
            disabled={activeIndex >= tabs.length - 1} aria-label="Avançar à próxima etapa">
            Próxima →
          </button>
        </nav>
      ) : null}
    </div>
  );
}
