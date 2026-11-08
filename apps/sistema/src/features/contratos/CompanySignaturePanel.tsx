"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelCompanySignatureRoundAction,
  changeCompanySignatureRepresentativeAction,
  confirmCompanySignatureAction,
  getCompanySignatureDocumentUrlAction,
  openCompanySignatureRoundAction,
} from "../../app/sistema/contratos-assinatura/actions";
import type { CompanySignaturePanelData, CompanySignaturePanelItem } from "../../lib/signatures/companySigningServer";
import { CONFIRMATION_STATEMENT } from "../../lib/signatures/companySigningText";
import { notify } from "../../lib/feedback/notify";

/**
 * Assinatura pela EMPRESA (Etapa 3A) — um cartão por documento. A imagem da
 * assinatura NUNCA é aplicada por estar logado: o ato exige declaração, nome
 * digitado, senha e o hash da versão exibida. O convite ao cliente só é
 * liberado depois que a empresa concluir (a regra também vale no servidor/banco).
 */

const STATUS_LABEL: Record<string, string> = {
  preparing: "Em preparação",
  signing: "Assinatura da empresa em andamento",
  completed: "Assinado pela empresa",
  cancelled: "Cancelada",
};

function formatWhen(iso?: string): string {
  return iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
}

function ItemCard({ item, data }: { item: CompanySignaturePanelItem; data: CompanySignaturePanelData }): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const usable = data.representatives.filter((option) => option.usable);
  const [representativeId, setRepresentativeId] = useState(item.round?.representativeId ?? usable[0]?.id ?? "");
  const [typedName, setTypedName] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const round = item.round;
  const started = (round?.signers ?? []).some((signer) => signer.signedAt);

  function run(task: () => Promise<{ error: string } | { ok: true }>, success: string): void {
    startTransition(async () => {
      const result = await task();
      if ("error" in result) {
        notify.error("Não foi possível concluir", result.error);
        return;
      }
      notify.success(success, "Registrado na auditoria. Nada foi enviado ao cliente.");
      router.refresh();
    });
  }

  function prepare(): void {
    run(() => openCompanySignatureRoundAction({ ...item.ref, representativeId: data.modality === "institutional" ? representativeId : undefined }), "Documento preparado para assinatura");
  }

  function openPdf(which: "prepared" | "latest"): void {
    if (!round) return;
    startTransition(async () => {
      const result = await getCompanySignatureDocumentUrlAction(round.id, which);
      if ("error" in result) {
        notify.error("Não foi possível abrir o PDF", result.error);
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  function confirm(): void {
    if (!round) return;
    startTransition(async () => {
      const result = await confirmCompanySignatureAction({
        roundId: round.id, typedName, acceptedStatement: accepted, password, displayedSha256: round.latestSha256,
      });
      setPassword("");
      if ("error" in result) {
        notify.error("A assinatura não foi registrada", result.error);
        return;
      }
      setTypedName("");
      setAccepted(false);
      notify.success(
        result.completed ? "Assinatura da empresa concluída" : "Assinatura registrada",
        result.completed ? "O convite ao cliente já pode ser criado." : `Faltam ${result.remaining} assinatura(s) da empresa.`,
      );
      router.refresh();
    });
  }

  return (
    <li className="destaques-item" style={{ display: "block" }}>
      <div className="destaques-item-body">
        <span className="materia-title">{item.title}</span>
        <span className="helper-text">
          {round ? STATUS_LABEL[round.status] : "Ainda não preparado para assinatura pela empresa"}
          {round ? ` · PDF ${round.layoutMode === "manual" ? "com posicionamento manual salvo para o modelo" : "com posicionamento automático"}` : ""}
        </span>
      </div>

      {!round ? (
        data.canPrepare ? (
          <div className="form-actions" style={{ alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {data.modality === "institutional" ? (
              <label className="helper-text">
                Representante legal que assina:{" "}
                <select value={representativeId} onChange={(e) => setRepresentativeId(e.target.value)} disabled={pending}>
                  {data.representatives.map((option) => (
                    <option key={option.id} value={option.id} disabled={!option.usable}>
                      {option.label}{option.rule === "joint" ? " (conjunta)" : ""}{option.usable ? "" : ` — indisponível: ${option.reason ?? ""}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button type="button" className="form-action-primary" disabled={pending || (data.modality === "institutional" && !representativeId)} onClick={prepare}>
              Preparar PDF para assinatura
            </button>
          </div>
        ) : (
          <p className="helper-text">Você não tem permissão para preparar este documento.</p>
        )
      ) : (
        <>
          <ul className="helper-text" style={{ margin: "6px 0 0 16px" }}>
            {round.signers.map((signer) => (
              <li key={signer.key}>
                {signer.signedAt ? "✓" : "○"} {signer.label}
                {signer.signedAt ? ` — assinou em ${formatWhen(signer.signedAt)}` : " — pendente"}
              </li>
            ))}
          </ul>
          <p className="helper-text" style={{ wordBreak: "break-all" }} title={round.latestSha256}>
            Versão exibida (SHA-256): {round.latestSha256}
          </p>

          <div className="form-actions" style={{ gap: 8, flexWrap: "wrap" }}>
            <button type="button" disabled={pending} onClick={() => openPdf("latest")}>Conferir PDF</button>
            {round.status !== "completed" && data.canPrepare ? (
              <button type="button" disabled={pending} onClick={() => setShowCancel((value) => !value)}>Cancelar rodada…</button>
            ) : null}
          </div>

          {data.modality === "institutional" && round.status === "preparing" && !started && data.canPrepare ? (
            <div className="form-actions" style={{ alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <label className="helper-text">
                Trocar representante (só enquanto está em preparação):{" "}
                <select value={representativeId} onChange={(e) => setRepresentativeId(e.target.value)} disabled={pending}>
                  {data.representatives.map((option) => (
                    <option key={option.id} value={option.id} disabled={!option.usable}>{option.label}{option.usable ? "" : " — indisponível"}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={pending || !representativeId || representativeId === round.representativeId}
                onClick={() => run(() => changeCompanySignatureRepresentativeAction(round.id, representativeId), "Representante trocado e PDF refeito")}
              >
                Trocar
              </button>
            </div>
          ) : null}
          {started && round.status !== "completed" ? (
            <p className="helper-text">A assinatura já começou: o representante e o documento não podem mais ser trocados. Para substituir, cancele com justificativa e abra outra rodada.</p>
          ) : null}

          {showCancel ? (
            <div style={{ marginTop: 8 }}>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Justificativa do cancelamento (mínimo 20 caracteres) — fica registrada na auditoria"
                rows={2}
                style={{ width: "100%" }}
              />
              <button
                type="button"
                disabled={pending || cancelReason.trim().length < 20}
                onClick={() => run(() => cancelCompanySignatureRoundAction(round.id, cancelReason), "Rodada cancelada")}
              >
                Confirmar cancelamento
              </button>
            </div>
          ) : null}

          {round.status !== "completed" ? (
            item.canSign.allowed ? (
              <fieldset style={{ marginTop: 10, border: "1px solid #cbd5e1", padding: 10 }} disabled={pending}>
                <legend>Assinar em nome da empresa</legend>
                <p className="helper-text">{CONFIRMATION_STATEMENT}</p>
                <label className="helper-text" style={{ display: "block" }}>
                  <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /> Li o PDF e declaro o que está acima.
                </label>
                <label className="helper-text" style={{ display: "block", marginTop: 6 }}>
                  Digite seu nome completo ({item.canSign.signerName}):
                  <input type="text" value={typedName} onChange={(e) => setTypedName(e.target.value)} autoComplete="off" style={{ display: "block", width: "100%" }} />
                </label>
                <label className="helper-text" style={{ display: "block", marginTop: 6 }}>
                  Sua senha de acesso (reconfirma sua identidade):
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={{ display: "block", width: "100%" }} />
                </label>
                <button type="button" className="form-action-primary" style={{ marginTop: 8 }} disabled={!accepted || !typedName.trim() || !password} onClick={confirm}>
                  Confirmar assinatura
                </button>
                <p className="helper-text">A imagem da assinatura cadastrada é só a representação visual. Isto não é certificado ICP-Brasil.</p>
              </fieldset>
            ) : (
              <p className="helper-text" style={{ marginTop: 6 }}>{item.canSign.reason}</p>
            )
          ) : (
            <p className="helper-text" style={{ marginTop: 6 }}>
              Assinado pela empresa. O convite ao cliente já pode ser criado
              {data.modality === "institutional" ? " usando a \"Versão assinada pela empresa\"" : ""}.
            </p>
          )}
        </>
      )}
    </li>
  );
}

export function CompanySignaturePanel({ data, heading }: { data: CompanySignaturePanelData; heading?: string }): JSX.Element | null {
  if (data.items.length === 0) return null;
  return (
    <section className="form-section">
      <h2>{heading ?? "Assinatura pela empresa"}</h2>
      <p className="helper-text">
        A empresa assina PRIMEIRO. Preparar o PDF não assina nada; a assinatura só é aplicada após a confirmação explícita de quem tem autoridade.
        O convite ao cliente só é liberado depois que a empresa concluir.
      </p>
      <ul className="destaques-list">
        {data.items.map((item) => (
          <ItemCard key={item.ref.commercialDocumentId ?? item.ref.documentId} item={item} data={data} />
        ))}
      </ul>
    </section>
  );
}
