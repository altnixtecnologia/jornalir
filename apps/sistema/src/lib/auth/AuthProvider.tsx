"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createSupabaseClient } from "../supabaseClient";

export type AuthRole = "owner" | "admin" | "operator";

export interface AuthProfile {
  id: string;
  name: string;
  role: AuthRole;
  active: boolean;
  createdAt: string;
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "inactive";

interface AuthContextValue {
  status: AuthStatus;
  profile: AuthProfile | null;
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
export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const client = useMemo(() => createSupabaseClient(), []);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile(userId: string): Promise<void> {
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
      if (!data.active) {
        await client.auth.signOut();
        if (cancelled) return;
        setProfile(null);
        setStatus("inactive");
        return;
      }
      setProfile({
        id: data.id,
        name: data.name,
        role: data.role as AuthRole,
        active: data.active,
        createdAt: data.created_at,
      });
      setStatus("authenticated");
    }

    void client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const userId = data.session?.user.id;
      if (userId) void loadProfile(userId);
      else setStatus("unauthenticated");
    });

    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const userId = session?.user.id;
      if (userId) void loadProfile(userId);
      else {
        setProfile(null);
        setStatus("unauthenticated");
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      profile,
      signOut: async () => {
        await client.auth.signOut();
      },
    }),
    [status, profile, client],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>.");
  return ctx;
}
