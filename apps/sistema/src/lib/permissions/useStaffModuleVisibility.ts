"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { createSupabaseBrowserClient } from "../supabase/browser";
import type { StaffModuleKey } from "./staffPermissionsCatalog";

type PermissionState = { userId: string; allowed: Set<string> };

/** Apenas navegação: segurança efetiva é responsabilidade de middleware, Server Actions e RLS. */
export function useStaffModuleVisibility(): {
  hasModule: (key: StaffModuleKey) => boolean;
  loading: boolean;
} {
  const { profile } = useAuth();
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [grants, setGrants] = useState<PermissionState | null>(null);
  const privileged = Boolean(profile?.active && (profile.role === "admin" || profile.role === "owner"));

  useEffect(() => {
    if (!profile || !profile.active || privileged || profile.role !== "operator") return;
    let cancelled = false;
    const userId = profile.id;
    async function load(): Promise<void> {
      const { data, error } = await client.from("staff_module_visibility")
        .select("module_key,enabled").eq("profile_id", userId);
      if (cancelled) return;
      setGrants({ userId, allowed: new Set(
        error ? [] : (data ?? []).filter((entry) => entry.enabled).map((entry) => entry.module_key),
      ) });
    }
    void load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [client, profile?.id, profile?.role, privileged]);

  const allowed = Boolean(profile && grants && grants.userId === profile.id);
  return {
    hasModule: (key: StaffModuleKey) => privileged || Boolean(allowed && grants!.allowed.has(key)),
    loading: Boolean(profile && profile.role === "operator" && !allowed),
  };
}
