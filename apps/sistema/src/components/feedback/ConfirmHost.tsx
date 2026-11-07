"use client";

import { useSyncExternalStore, type JSX } from "react";
import { ConfirmDialog } from "../admin/ConfirmDialog";
import { getCurrentConfirm, settleConfirm, subscribeConfirm } from "../../lib/feedback/confirmStore";

/** Único leitor do `confirmStore` — renderiza a confirmação pendente no modal do sistema. */
export function ConfirmHost(): JSX.Element | null {
  const pending = useSyncExternalStore(subscribeConfirm, getCurrentConfirm, () => null);
  if (!pending) return null;
  const paragraphs = (pending.description ?? "").split(/\n\s*\n/).filter((part) => part.trim().length > 0);
  return (
    <ConfirmDialog
      key={pending.id}
      open
      title={pending.title}
      description={paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
      confirmLabel={pending.confirmLabel ?? "Confirmar"}
      cancelLabel={pending.cancelLabel ?? "Cancelar"}
      destructive={pending.destructive ?? true}
      onConfirm={() => settleConfirm(pending.id, true)}
      onCancel={() => settleConfirm(pending.id, false)}
    />
  );
}
