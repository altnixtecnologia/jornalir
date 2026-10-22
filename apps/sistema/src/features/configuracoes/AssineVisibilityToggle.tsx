"use client";

import { useState, useTransition } from "react";
import { setAssineEnabledAction } from "../../app/sistema/configuracoes/valores-assine/actions";

/** Liga/desliga a página pública /assine (que também reúne Anuncie) — pedido
 * explícito do usuário em 18/10/2026. Estado inicial sempre o que vier do
 * banco (nunca presumido ativo); erro ao salvar reverte o visual para o
 * último estado confirmado, nunca finge sucesso. */
export function AssineVisibilityToggle({ initialEnabled }: { initialEnabled: boolean }): JSX.Element {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(): void {
    const next = !enabled;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const result = await setAssineEnabledAction(next);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setEnabled(next);
        setSuccess(next
          ? "Assine ativado. O botão e a página serão exibidos ao atualizar o portal."
          : "Assine desativado. O portal deixará de oferecer novas solicitações.");
      } catch {
        setError("Não foi possível salvar. Confira a conexão e tente novamente.");
      }
    });
  }

  return (
    <section className="form-section form-section--first" aria-labelledby="assine-visibility-title">
      <h2 id="assine-visibility-title">Exibir Assine no site</h2>
      <p className="helper-text">
        Controla se o botão/página <strong>Assine</strong> (que também reúne Anuncie) aparece no site público —
        cabeçalho desktop, cabeçalho mobile, menu mobile e acesso direto a <code>/assine</code>. Desativado também
        impede novas solicitações enviadas pela página. Patrocinadores e demais funcionalidades comerciais
        continuam funcionando normalmente, independente deste controle.
      </p>
      <div className="cadastro-status-inline" style={{ marginTop: "12px" }}>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={pending}
          className={`switch-control${enabled ? " is-on" : ""}`}
          onClick={toggle}
        >
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          <span>{pending ? "Salvando…" : enabled ? "Ativado" : "Desativado"}</span>
        </button>
      </div>
      {success ? <p className="form-success" role="status">{success}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}
