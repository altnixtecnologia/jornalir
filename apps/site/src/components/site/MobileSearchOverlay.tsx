"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function MobileSearchOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [open]);

  function submit(): void {
    const value = query.trim();
    if (!value) return;
    onClose();
    router.push(`/busca?q=${encodeURIComponent(value)}`);
  }

  return (
    <div className={`mobile-search-layer lg:hidden ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <button type="button" className="mobile-search-backdrop" aria-label="Fechar busca" onClick={onClose} />
      <form
        role="search"
        className="mobile-search-popover"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <svg className="mobile-search-popover-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="O que você quer pesquisar?"
          aria-label="Buscar no site"
        />
        <button type="submit" className="mobile-search-submit" disabled={!query.trim()}>
          Buscar
        </button>
      </form>
    </div>
  );
}
