"use client";

import { useState, type JSX } from "react";

/**
 * Auditoria antes de implementar: `phonePrimary`/`phoneSecondary`/
 * `whatsapp` em `clients` são colunas `text` simples (uma string cada,
 * ver migration 20261011100000_clients.sql / 20261014110000_clients.sql)
 * — nunca houve DDI separado. Mantemos exatamente esse contrato: o valor
 * salvo continua sendo UMA string só (`+<ddi><resto digitado>`), o DDI é
 * separado só visualmente aqui. DDD continua dentro do "resto", nunca
 * extraído.
 */
function splitPhone(value: string): { ddi: string; rest: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^\+(\d{1,3})(.*)$/);
  if (match) return { ddi: match[1], rest: match[2].trim() };
  return { ddi: "55", rest: trimmed };
}

export function PhoneField({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
}): JSX.Element {
  const { ddi, rest } = splitPhone(value);
  const [editingDdi, setEditingDdi] = useState(false);
  const [ddiDraft, setDdiDraft] = useState(ddi);

  function commitDdi(): void {
    const cleaned = ddiDraft.replace(/\D/g, "").slice(0, 3) || "55";
    onChange(rest ? `+${cleaned}${rest}` : `+${cleaned}`);
    setEditingDdi(false);
  }

  function cancelDdiEdit(): void {
    setDdiDraft(ddi);
    setEditingDdi(false);
  }

  return (
    <span className="cadastro-phone-group">
      {editingDdi ? (
        <input
          type="text"
          inputMode="numeric"
          className="cadastro-phone-ddi-input"
          value={ddiDraft}
          autoFocus
          maxLength={3}
          aria-label="Código do país (DDI)"
          onChange={(event) => setDdiDraft(event.target.value.replace(/\D/g, ""))}
          onBlur={commitDdi}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitDdi();
            } else if (event.key === "Escape") {
              cancelDdiEdit();
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="cadastro-phone-prefix"
          onClick={() => {
            setDdiDraft(ddi);
            setEditingDdi(true);
          }}
          aria-label={`Código do país atual +${ddi}. Clique para alterar.`}
          title="Clique para alterar o DDI"
        >
          +{ddi}
        </button>
      )}
      <input
        type="text"
        value={rest}
        onChange={(event) => onChange(`+${ddi}${event.target.value}`)}
        placeholder="(48) 99999-9999"
        aria-label={ariaLabel}
      />
    </span>
  );
}
