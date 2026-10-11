"use client";

import { useEffect, useRef, type JSX, type ReactNode } from "react";

/**
 * Modal de confirmação reutilizável — `<dialog>` nativo (mesmo elemento já
 * usado em `AdminShell.tsx` pro menu mobile, não um componente novo do
 * zero): `showModal()`/`close()` dão foco preso no modal, Escape fecha
 * (evento `cancel` nativo) e foco volta ao elemento de origem de graça,
 * sem reimplementar nada disso à mão. Nunca `window.confirm()`.
 *
 * Aplicado nesta tarefa somente em Aniversariantes — o mesmo componente
 * poderá ser reutilizado por Cadastros/Anexos/Assinaturas/etc. depois,
 * sem alterá-los agora.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="ir-modal ir-modal--confirm"
      aria-labelledby="ir-confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onCancel();
      }}
    >
      <h2 id="ir-confirm-title">{title}</h2>
      <div className="ir-confirm-body">{description}</div>
      <div className="ir-confirm-actions">
        <button type="button" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className={destructive ? "form-action-danger" : "form-action-primary"} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
