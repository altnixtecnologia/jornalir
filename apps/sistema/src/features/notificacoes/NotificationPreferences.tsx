"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { useAuth } from "../../lib/auth/AuthProvider";

type Flags = {
  ordinary_enabled: boolean;
  urgent_enabled: boolean;
  agenda_enabled: boolean;
  sound_enabled: boolean;
  vibration_enabled: boolean;
};
const DEFAULT: Flags = {
  ordinary_enabled: false,
  urgent_enabled: false,
  agenda_enabled: false,
  sound_enabled: false,
  vibration_enabled: false,
};
const OPTIONS: { id: keyof Flags; label: string; description: string }[] = [
  { id: "ordinary_enabled", label: "Avisos administrativos", description: "Futuras notificações sobre atividades do sistema." },
  { id: "urgent_enabled", label: "Avisos importantes", description: "Alertas relevantes do jornal, quando esse canal estiver ativo." },
  { id: "agenda_enabled", label: "Lembretes da Agenda", description: "Lembretes dos compromissos atribuídos a você." },
  { id: "sound_enabled", label: "Permitir som", description: "Quando compatível com as permissões do celular." },
  { id: "vibration_enabled", label: "Permitir vibração", description: "Quando o sistema operacional e o dispositivo permitirem." },
];
export function NotificationPreferences(): JSX.Element {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const { profile, localPreview } = useAuth();
  const [flags, setFlags] = useState<Flags>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || localPreview) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void client.from("notification_preferences")
      .select("ordinary_enabled,urgent_enabled,agenda_enabled,sound_enabled,vibration_enabled")
      .eq("profile_id", profile.id).eq("app_kind", "sistema").maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setMessage("Não foi possível carregar as preferências: " + error.message);
        else if (data) setFlags(data as Flags);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [client, profile?.id, localPreview]);

  async function save(): Promise<void> {
    if (!profile || localPreview || saving) return;
    setSaving(true);
    setMessage(null);
    const { error } = await client.from("notification_preferences").upsert({
      profile_id: profile.id,
      app_kind: "sistema",
      ...flags,
      updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id,app_kind" });
    setMessage(error ? "Erro ao salvar: " + error.message : "Preferências registradas.");
    setSaving(false);
  }

  return (
    <section className="form-section" aria-label="Preferências de notificação">
      <h2>Notificações do aplicativo</h2>
      <p className="helper-text">Defina antecipadamente o que deseja receber. O cadastro de preferências já funciona; o envio de push e os alarmes nativos ainda serão ativados em uma etapa posterior. O Telegram da Agenda permanece independente.</p>
      {localPreview ? <p className="helper-text">Pré-visualização: configurações não são salvas.</p> : null}
      {loading ? <p>Carregando preferências...</p> : (
        <>
          <div className="notification-preferences-list">
            {OPTIONS.map((option) => (
              <label key={option.id} className="notification-preference-item">
                <input
                  type="checkbox"
                  checked={flags[option.id]}
                  disabled={saving || localPreview}
                  onChange={(event) => setFlags((current) => ({ ...current, [option.id]: event.target.checked }))}
                />
                <span><strong>{option.label}</strong><small>{option.description}</small></span>
              </label>
            ))}
          </div>
          <button type="button" className="form-action-primary" disabled={saving || localPreview} onClick={() => void save()}>
            {saving ? "Salvando..." : "Salvar preferências"}
          </button>
        </>
      )}
      {message ? <p role="status" className="helper-text">{message}</p> : null}
    </section>
  );
}
