"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MediaAsset, SiteAdSettings, SiteAdSlotWithMedia, SiteAdTransitionEffect } from "@ir/types";
import { SITE_AD_TRANSITION_EFFECT_LABELS, SITE_AD_TRANSITION_EFFECTS, isSiteAdMediaCurrentlyActive } from "@ir/types";
import { ClientPicker } from "../../components/admin/ClientPicker";
import type { ClientSearchResult } from "../../components/admin/clientSearchTypes";
import { uploadMediaAssets } from "../../app/sistema/editorial/midias/actions";
import {
  addSiteAdMediaAction,
  removeSiteAdMediaAction,
  reorderSiteAdMediaAction,
  toggleSiteAdSlotActiveAction,
  updateSiteAdMediaAction,
  updateSiteAdSettingsAction,
  type SiteAdMediaFormInput,
} from "../../app/sistema/configuracoes/patrocinadores/actions";

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function emptyMediaInput(): SiteAdMediaFormInput {
  return { clientId: "", href: "", altText: "", activeFrom: "", activeUntil: "" };
}

/**
 * Patrocinadores do site — gestão das 6 posições fixas (nunca
 * criadas/removidas aqui). Upload real reaproveita uploadMediaAssets
 * (mesmo pipeline R2 do módulo Mídias) — nenhum storage novo. Benefício/
 * brinde: nunca gera venda/Financeiro/NFS-e (ver módulo Comercial,
 * totalmente separado).
 */
export function SiteAdSlotsPanel({ settings, slots }: { settings: SiteAdSettings; slots: SiteAdSlotWithMedia[] }): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rotationSeconds, setRotationSeconds] = useState(String(settings.rotationIntervalMs / 1000));
  const [effect, setEffect] = useState<SiteAdTransitionEffect>(settings.transitionEffect);
  const [addingSlotId, setAddingSlotId] = useState<string | null>(null);
  const [newMedia, setNewMedia] = useState<SiteAdMediaFormInput>(emptyMediaInput());
  const [newMediaClient, setNewMediaClient] = useState<ClientSearchResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSaveSettings(): void {
    setError(null);
    const ms = Math.max(2, Math.min(120, Number(rotationSeconds) || 10)) * 1000;
    startTransition(async () => {
      const result = await updateSiteAdSettingsAction(settings.id, ms, effect);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleToggleSlot(slotId: string, active: boolean): void {
    setError(null);
    startTransition(async () => {
      const result = await toggleSiteAdSlotActiveAction(slotId, active);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function startAdding(slotId: string): void {
    setAddingSlotId(slotId);
    setNewMedia(emptyMediaInput());
    setNewMediaClient(null);
    setError(null);
  }

  function handleAddMedia(slot: SiteAdSlotWithMedia): void {
    setError(null);
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Selecione um arquivo de imagem.");
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.append("files", file);
      const uploadResult = await uploadMediaAssets(formData);
      if ("error" in uploadResult) {
        setError(uploadResult.error);
        return;
      }
      const asset: MediaAsset = uploadResult.assets[0];
      const result = await addSiteAdMediaAction(slot.id, asset.id, slot.media.length, { ...newMedia, clientId: newMediaClient?.id ?? "" });
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setAddingSlotId(null);
      router.refresh();
    });
  }

  function handleUpdateMedia(id: string, current: SiteAdMediaFormInput & { active: boolean }): void {
    setError(null);
    startTransition(async () => {
      const result = await updateSiteAdMediaAction(id, current);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleRemoveMedia(id: string): void {
    setError(null);
    startTransition(async () => {
      const result = await removeSiteAdMediaAction(id);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleMove(slot: SiteAdSlotWithMedia, index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= slot.media.length) return;
    const ids = slot.media.map((m) => m.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(target, 0, moved);
    setError(null);
    startTransition(async () => {
      const result = await reorderSiteAdMediaAction(slot.id, ids);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <section className="inline-form form-section form-section--first">
        <h2>Configuração global de rotação</h2>
        <p className="helper-text">Vale para os 6 quadros ao mesmo tempo — nunca um efeito diferente por imagem.</p>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Intervalo entre imagens (segundos)</span>
            <input type="number" min="2" max="120" value={rotationSeconds} onChange={(event) => setRotationSeconds(event.target.value)} disabled={pending} />
          </label>
          <label className="form-field">
            <span className="field-label">Efeito de transição</span>
            <select value={effect} onChange={(event) => setEffect(event.target.value as SiteAdTransitionEffect)} disabled={pending}>
              {SITE_AD_TRANSITION_EFFECTS.map((value) => (
                <option key={value} value={value}>
                  {SITE_AD_TRANSITION_EFFECT_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-actions">
          <button type="button" className="form-action-primary" onClick={handleSaveSettings} disabled={pending}>
            {pending ? "Salvando…" : "Salvar configuração"}
          </button>
        </div>
      </section>

      {slots.map((slot) => (
        <section key={slot.id} className="inline-form form-section">
          <div className="form-actions" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>
              Posição {slot.slotNumber} <span className={`status-pill ${slot.active ? "status-pill--published" : "status-pill--archived"}`}>{slot.active ? "Ativa" : "Desativada"}</span>
            </h2>
            <button type="button" onClick={() => handleToggleSlot(slot.id, !slot.active)} disabled={pending}>
              {slot.active ? "Desativar posição" : "Ativar posição"}
            </button>
          </div>

          {slot.media.length === 0 ? (
            <p className="helper-text" style={{ marginTop: "8px" }}>Nenhuma imagem cadastrada nesta posição ainda.</p>
          ) : (
            <div className="materias-table-wrap" style={{ marginTop: "8px" }}>
              <table className="materias-table">
                <thead>
                  <tr>
                    <th>Imagem</th>
                    <th>Patrocinador</th>
                    <th>Link</th>
                    <th>Período</th>
                    <th>Vigente hoje</th>
                    <th>Ordem</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {slot.media.map((media, index) => (
                    <tr key={media.id}>
                      <td>
                        <img src={media.imageUrl} alt={media.altText ?? media.mediaAssetAltText ?? ""} style={{ width: "72px", height: "54px", objectFit: "cover", borderRadius: "4px" }} />
                      </td>
                      <td>{media.clientName ?? "—"}</td>
                      <td>{media.href ? <a href={media.href} target="_blank" rel="noreferrer">{media.href}</a> : "—"}</td>
                      <td>
                        {media.activeFrom || media.activeUntil ? `${formatDate(media.activeFrom)} a ${formatDate(media.activeUntil)}` : "Sem período"}
                      </td>
                      <td>
                        <span className={`status-pill ${isSiteAdMediaCurrentlyActive(media) ? "status-pill--published" : "status-pill--archived"}`}>
                          {isSiteAdMediaCurrentlyActive(media) ? "Sim" : "Não"}
                        </span>
                      </td>
                      <td>
                        <div className="form-actions">
                          <button type="button" onClick={() => handleMove(slot, index, -1)} disabled={pending || index === 0}>
                            ↑
                          </button>
                          <button type="button" onClick={() => handleMove(slot, index, 1)} disabled={pending || index === slot.media.length - 1}>
                            ↓
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="form-actions">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateMedia(media.id, {
                                clientId: media.clientId ?? "",
                                href: media.href ?? "",
                                altText: media.altText ?? "",
                                activeFrom: media.activeFrom ?? "",
                                activeUntil: media.activeUntil ?? "",
                                active: !media.active,
                              })
                            }
                            disabled={pending}
                          >
                            {media.active ? "Desativar" : "Ativar"}
                          </button>
                          <button type="button" className="form-action-danger" onClick={() => handleRemoveMedia(media.id)} disabled={pending}>
                            Remover
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {addingSlotId === slot.id ? (
            <div className="form-grid" style={{ marginTop: "12px" }}>
              <label className="form-field" style={{ gridColumn: "1 / -1" }}>
                <span className="field-label">Arquivo de imagem</span>
                <input ref={fileInputRef} type="file" accept="image/*" disabled={pending} />
              </label>
              <div className="form-field" style={{ gridColumn: "1 / -1" }}>
                <ClientPicker selected={newMediaClient} onSelect={setNewMediaClient} disabled={pending} helperText="Opcional — quem anuncia nesta imagem, se houver." />
              </div>
              <label className="form-field">
                <span className="field-label">Link <span className="field-optional">(opcional)</span></span>
                <input type="text" value={newMedia.href} onChange={(event) => setNewMedia((prev) => ({ ...prev, href: event.target.value }))} disabled={pending} placeholder="https://…" />
              </label>
              <label className="form-field">
                <span className="field-label">Texto alternativo <span className="field-optional">(opcional)</span></span>
                <input type="text" value={newMedia.altText} onChange={(event) => setNewMedia((prev) => ({ ...prev, altText: event.target.value }))} disabled={pending} />
              </label>
              <label className="form-field">
                <span className="field-label">Início do período <span className="field-optional">(opcional)</span></span>
                <input type="date" value={newMedia.activeFrom} onChange={(event) => setNewMedia((prev) => ({ ...prev, activeFrom: event.target.value }))} disabled={pending} />
              </label>
              <label className="form-field">
                <span className="field-label">Fim do período <span className="field-optional">(opcional)</span></span>
                <input type="date" value={newMedia.activeUntil} onChange={(event) => setNewMedia((prev) => ({ ...prev, activeUntil: event.target.value }))} disabled={pending} />
              </label>
              <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
                <button type="button" className="form-action-primary" onClick={() => handleAddMedia(slot)} disabled={pending}>
                  {pending ? "Enviando…" : "Enviar e adicionar"}
                </button>
                <button type="button" onClick={() => setAddingSlotId(null)} disabled={pending}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="form-actions" style={{ marginTop: "8px" }}>
              <button type="button" onClick={() => startAdding(slot.id)} disabled={pending}>
                + Adicionar imagem
              </button>
            </div>
          )}
        </section>
      ))}
    </>
  );
}
