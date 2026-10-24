"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createSupabaseBrowserClient } from "../supabase/browser";
import { LOCAL_PREVIEW_PROFILE } from "./localPreview";
import {staffNameLabel} from "./userIdentity";

export type AuthRole = "owner" | "admin" | "operator";

export interface AuthProfile {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
  active: boolean;
  createdAt: string;
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "inactive";

interface AuthContextValue {
  status: AuthStatus;
  profile: AuthProfile | null;
  /** Visualização local (SYSTEM_LOCAL_PREVIEW) — Meu perfil usa isto pra nunca chamar Supabase Auth real nesse modo. */
  localPreview: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Sessão real do painel (Supabase Auth, Fase 19) — nunca localStorage como
 * fonte de verdade. O SDK do Supabase cuida de persistir/renovar o token
 * internamente; aqui só reagimos ao estado que ele reporta
 * (`getSession`/`onAuthStateChange`) e carregamos o `profiles` real
 * correspondente. `active = false` desconecta a sessão imediatamente —
 * a conta existe no Auth, mas não pode operar o painel.
 */
export function AuthProvider({
  children,
  localPreview = false
}: {
  children: ReactNode;
  /** Decidido só no Server Component raiz (ver lib/auth/localPreview.ts) — nunca recalculado aqui. */
  localPreview?: boolean;
}): JSX.Element {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<AuthStatus>(localPreview ? "authenticated" : "loading");
  const [profile, setProfile] = useState<AuthProfile | null>(localPreview ? LOCAL_PREVIEW_PROFILE : null);

  useEffect(() => {
    if (localPreview) return;
    let cancelled = false;

    async function loadProfile(userId: string, email: string | undefined): Promise<void> {
      // A sessão local pode ter sido criada por OTP externo, inclusive um
      // signatário, ou ainda não ter e-mail confirmado. getUser confirma
      // identidade real antes de disponibilizar menus do painel.
      const {data:identity,error:identityError}=await client.auth.getUser();
      if(cancelled) return;
      if(identityError || identity.user?.id!==userId ||
         !identity.user.email_confirmed_at){
        setProfile(null);
        setStatus("inactive");
        return;
      }
      const { data, error } = await client
        .from("profiles")
        .select("id, name, role, active, created_at")
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setProfile(null);
        setStatus("unauthenticated");
        return;
      }
      const {data:staffAllowed,error:staffError}=await client.rpc("is_active_staff");
      if (!data.active || staffError || staffAllowed!==true) {
        await client.auth.signOut();
        if (cancelled) return;
        setProfile(null);
        setStatus("inactive");
        return;
      }
      setProfile({
        id: data.id,
        name: staffNameLabel(data.name,email),
        email: email ?? "",
        role: data.role as AuthRole,
        active: data.active,
        createdAt: data.created_at,
      });
      setStatus("authenticated");
    }

    void client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const userId = data.session?.user.id;
      if (userId) void loadProfile(userId, data.session?.user.email);
      else setStatus("unauthenticated");
    });

    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const userId = session?.user.id;
      if (userId) void loadProfile(userId, session?.user.email);
      else {
        setProfile(null);
        setStatus("unauthenticated");
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [client, localPreview]);

  // Abas deixadas abertas por muito tempo podem ser suspensas pelo
  // navegador. Ao voltar para o painel, valida a sessão no servidor antes
  // de continuar usando a UI. Se o refresh token já expirou/revogou, o
  // AuthGate faz navegação completa para /login, evitando estado quebrado
  // ou tela 404 depois de longos períodos de inatividade.
  useEffect(() => {
    if (localPreview) return;

    let validating = false;

    async function validateSessionOnResume(): Promise<void> {
      if (validating || document.visibilityState === "hidden") return;
      validating = true;
      try {
        const {
          data: { user },
          error,
        } = await client.auth.getUser();

        if (error || !user) {
          setProfile(null);
          setStatus("unauthenticated");
        }
      } finally {
        validating = false;
      }
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        void validateSessionOnResume();
      }
    }

    window.addEventListener("focus", validateSessionOnResume);
    window.addEventListener("pageshow", validateSessionOnResume);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", validateSessionOnResume);
      window.removeEventListener("pageshow", validateSessionOnResume);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [client, localPreview]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      profile,
      localPreview,
      signOut: async () => {
        if (localPreview) {
          setStatus("unauthenticated");
          setProfile(null);
          return;
        }
        await client.auth.signOut();
      },
    }),
    [status, profile, client, localPreview],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>.");
  return ctx;
}
