"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "../../lib/auth/AuthProvider";
import { ROLE_LABELS, getInitials } from "../../lib/auth/accountDisplay";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

function EyeIcon({ open }: { open: boolean }): JSX.Element {
  return open ? (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.6 5.6A10.4 10.4 0 0112 5.5c5 0 9 4 10.5 6.5a12.5 12.5 0 01-2.9 3.4M6.4 6.4A13 13 0 001.5 12c1.1 1.9 3 4.3 5.9 5.7a10.4 10.4 0 004.6 1.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M1.5 12C3 9.5 7 5.5 12 5.5S21 9.5 22.5 12C21 14.5 17 18.5 12 18.5S3 14.5 1.5 12z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** Mesmo padrão visual de mostrar/ocultar senha já usado no login. */
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}): JSX.Element {
  const [show, setShow] = useState(false);
  return (
    <label className="form-field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <div className="login-password-wrap">
        <input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="login-password-toggle"
          onClick={() => setShow((value) => !value)}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={show}
        >
          <EyeIcon open={show} />
        </button>
      </div>
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <label className="form-field">
      <span className="field-label">{label}</span>
      <input type="text" value={typeof value === "string" ? value : undefined} disabled readOnly />
    </label>
  );
}

/**
 * Meu perfil — autoatendimento da PRÓPRIA conta (nome editável; e-mail,
 * papel e status só leitura) + troca de senha (reautentica com a senha
 * atual antes de trocar — nunca confia no cliente, nunca salva senha em
 * tabela). Disponível para qualquer papel; gestão de OUTRAS contas
 * continua exclusivamente em /sistema/usuarios.
 */
export function ProfileSettings(): JSX.Element {
  const { profile, localPreview } = useAuth();
  const client = useMemo(() => createSupabaseBrowserClient(), []);

  const [name, setName] = useState(profile?.name ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [namePending, setNamePending] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordPending, setPasswordPending] = useState(false);

  if (!profile) return <p className="helper-text">Carregando…</p>;
  const accountEmail = profile.email;

  async function handleSaveName(event: FormEvent): Promise<void> {
    event.preventDefault();
    setNameError(null);
    setNameMessage(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("O nome não pode ficar vazio.");
      return;
    }
    if (localPreview) {
      setNameMessage("Nome atualizado (visualização local — nada é salvo de verdade).");
      return;
    }
    setNamePending(true);
    const { error } = await client.rpc("update_own_profile_name", { p_name: trimmed });
    setNamePending(false);
    if (error) {
      setNameError("Não foi possível salvar o nome agora. Tente novamente.");
      return;
    }
    setNameMessage("Nome atualizado.");
  }

  async function handleChangePassword(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);

    if (localPreview) {
      setPasswordError("Alterar senha não está disponível em visualização local.");
      return;
    }
    if (!currentPassword) {
      setPasswordError("Informe a senha atual.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("A confirmação não coincide com a nova senha.");
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError("A nova senha não pode ser igual à senha atual.");
      return;
    }

    setPasswordPending(true);
    // Reautentica com a senha ATUAL antes de qualquer troca — nunca confia
    // que quem está com a sessão aberta sabe a senha de fato. Mesma sessão
    // continua válida depois (signInWithPassword só renova o token).
    const { error: reauthError } = await client.auth.signInWithPassword({
      email: accountEmail,
      password: currentPassword,
    });
    if (reauthError) {
      setPasswordPending(false);
      setPasswordError("Senha atual incorreta.");
      return;
    }

    const { error: updateError } = await client.auth.updateUser({ password: newPassword });
    setPasswordPending(false);
    if (updateError) {
      setPasswordError("Não foi possível alterar a senha agora. Tente novamente.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage("Senha alterada com sucesso.");
  }

  return (
    <>
      <div className="account-summary-strip">
        <span className="account-initials account-initials--lg" aria-hidden="true">
          {getInitials(profile.name)}
        </span>
        <div className="account-summary-identity">
          <p className="account-summary-name">{profile.name}</p>
          <p className="account-summary-email">{profile.email}</p>
        </div>
        <span className="status-pill status-pill--published">{ROLE_LABELS[profile.role]}</span>
        <span className={`status-pill ${profile.active ? "status-pill--published" : "status-pill--archived"}`}>
          {profile.active ? "Ativo" : "Inativo"}
        </span>
      </div>

      <section className="profile-section">
        <h2>Dados do perfil</h2>
        <form className="form-grid" onSubmit={handleSaveName}>
          <label className="form-field" htmlFor="profile-name">
            <span className="field-label">Nome</span>
            <input id="profile-name" type="text" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <ReadOnlyField label="E-mail" value={profile.email} />
          <ReadOnlyField label="Perfil" value={ROLE_LABELS[profile.role]} />
          <ReadOnlyField label="Status" value={profile.active ? "Ativo" : "Inativo"} />

          {nameError ? (
            <p className="form-error" role="alert" style={{ gridColumn: "1 / -1" }}>
              {nameError}
            </p>
          ) : null}
          {nameMessage ? (
            <p className="helper-text" style={{ gridColumn: "1 / -1" }}>
              {nameMessage}
            </p>
          ) : null}

          <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="form-action-primary" disabled={namePending}>
              {namePending ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </form>
      </section>

      <section className="profile-section" id="seguranca">
        <h2>Segurança</h2>
        <form className="form-grid" onSubmit={handleChangePassword}>
          <PasswordField id="current-password" label="Senha atual" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
          <PasswordField id="new-password" label="Nova senha" value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
          <PasswordField id="confirm-password" label="Confirmar nova senha" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />

          {passwordError ? (
            <p className="form-error" role="alert" style={{ gridColumn: "1 / -1" }}>
              {passwordError}
            </p>
          ) : null}
          {passwordMessage ? (
            <p className="helper-text" style={{ gridColumn: "1 / -1" }}>
              {passwordMessage}
            </p>
          ) : null}

          <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="form-action-primary" disabled={passwordPending}>
              {passwordPending ? "Alterando…" : "Alterar senha"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
