"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { registerContractDraft } from "./actions";

export function RegisterContractDraftButton({ origin, id }: { origin: "assinatura" | "venda"; id: string }): JSX.Element {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  function save(): void {
    setError(null);
    startTransition(async () => {
      const result = await registerContractDraft(origin, id);
      if ("error" in result) {
        setError(result.error);
      } else {
        setClientId(result.clientId);
      }
    });
  }
  return (
    <>
      {clientId ? (
        <Link href={`/sistema/clientes/${clientId}`} className="form-action-primary">Ver minuta no cliente</Link>
      ) : (
        <button type="button" disabled={busy} onClick={save}>
          {busy ? "Registrando..." : "Salvar minuta no cliente"}
        </button>
      )}
      {error ? <span role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span> : null}
    </>
  );
}
