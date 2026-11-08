"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  getMySignatureStateAction,
  removeMySignatureAction,
  uploadMySignatureAction,
  type MySignatureState,
} from "../../app/sistema/perfil/signature-actions";
import { notify } from "../../lib/feedback/notify";

/**
 * Assinatura em PNG do Meu perfil — só aparece para quem tem a permissão
 * `publicidade.contratos_assinar` (o servidor decide; sem a permissão este
 * componente não renderiza nada). A imagem é só a representação gráfica:
 * nunca assina nada sozinha.
 */
export function SignatureSection(): JSX.Element | null {
  const [state, setState] = useState<MySignatureState | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    const result = await getMySignatureStateAction();
    if ("error" in result) {
      setState({ authorized: false, hasImage: false });
      return;
    }
    setState(result.state);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state || !state.authorized) return null;

  function onFile(file: File | undefined): void {
    if (!file) return;
    const data = new FormData();
    data.set("file", file);
    startTransition(async () => {
      const result = await uploadMySignatureAction(data);
      if (fileRef.current) fileRef.current.value = "";
      if ("error" in result) {
        notify.error("Não foi possível salvar a assinatura", result.error);
        return;
      }
      notify.success("Assinatura salva", "Armazenada em área privada. Só você a vê.");
      await load();
    });
  }

  function remove(): void {
    startTransition(async () => {
      const result = await removeMySignatureAction();
      if ("error" in result) {
        notify.error("Não foi possível remover a assinatura", result.error);
        return;
      }
      notify.success("Assinatura removida", "A imagem não está mais vinculada ao seu perfil.");
      await load();
    });
  }

  return (
    <section className="form-section" aria-labelledby="signature-title">
      <h2 id="signature-title">Minha assinatura (imagem PNG)</h2>
      <p className="helper-text">
        Imagem usada apenas como representação visual quando você assinar contratos comerciais em nome da empresa.
        Ela <strong>não assina nada sozinha</strong>: cada assinatura exigirá a sua confirmação expressa. Formato PNG, até 512 KB,
        fundo transparente ou branco. Fica em armazenamento privado e só você a vê.
      </p>
      {state.hasImage && state.previewUrl ? (
        <div style={{ margin: "8px 0" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.previewUrl}
            alt="Sua assinatura cadastrada"
            style={{ maxWidth: 320, maxHeight: 120, background: "#fff", border: "1px solid #ddd" }}
          />
          <p className="helper-text">
            Cadastrada em {state.updatedAt ? new Date(state.updatedAt).toLocaleString("pt-BR") : "—"} · {Math.round((state.sizeBytes ?? 0) / 1024)} KB
          </p>
        </div>
      ) : (
        <p className="helper-text">Você ainda não cadastrou uma imagem de assinatura.</p>
      )}
      <div className="form-actions">
        <button type="button" className="form-action-primary" disabled={pending} onClick={() => fileRef.current?.click()}>
          {pending ? "Enviando…" : state.hasImage ? "Trocar imagem" : "Enviar imagem PNG"}
        </button>
        {state.hasImage ? (
          <button type="button" disabled={pending} onClick={remove}>Remover</button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/png"
          style={{ display: "none" }}
          aria-label="Enviar imagem PNG da sua assinatura"
          onChange={(event) => onFile(event.target.files?.[0])}
        />
      </div>
    </section>
  );
}
