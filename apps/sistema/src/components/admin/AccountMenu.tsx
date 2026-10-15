"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/auth/AuthProvider";
import { ROLE_LABELS, getInitials } from "../../lib/auth/accountDisplay";

/**
 * Menu de conta do header (substitui o antigo "nome + Sair" avulsos) —
 * fecha ao clicar fora, ao navegar ou ao escolher uma opção. Sem
 * foto/avatar externo, só iniciais calculadas do nome.
 */
export function AccountMenu(): JSX.Element | null {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!profile) return null;

  async function handleLogout(): Promise<void> {
    setOpen(false);
    await signOut();
    router.push("/login");
  }

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        type="button"
        className="account-menu-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="account-initials" aria-hidden="true">
          {getInitials(profile.name)}
        </span>
        <span className="account-menu-name">{profile.name}</span>
        <span className="account-menu-caret" aria-hidden="true">▾</span>
      </button>

      {open ? (
        <div className="account-menu-panel" role="menu">
          <div className="account-menu-info">
            <p className="account-menu-info-name">{profile.name}</p>
            <p className="account-menu-info-email">{profile.email}</p>
            <span className="status-pill status-pill--published">{ROLE_LABELS[profile.role]}</span>
          </div>
          <Link href="/sistema/perfil" className="account-menu-link" role="menuitem" onClick={() => setOpen(false)}>
            Meu perfil
          </Link>
          <Link href="/sistema/perfil#seguranca" className="account-menu-link" role="menuitem" onClick={() => setOpen(false)}>
            Alterar senha
          </Link>
          <Link href="/sistema/preferencias-notificacoes" className="account-menu-link" role="menuitem" onClick={() => setOpen(false)}>
            Notificações do aplicativo
          </Link>
          <div className="account-menu-divider" role="separator" />
          <button type="button" className="account-menu-link account-menu-signout" role="menuitem" onClick={handleLogout}>
            Sair
          </button>
        </div>
      ) : null}
    </div>
  );
}
