"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { createSupabaseBrowserClient } from "../supabase/browser";
import type { FinanceActionKey } from "./staffPermissionsCatalog";

type Grants = { userId: string; allowed: Set<string>; moduleEnabled: boolean };

/** Controle de exibição; a autorização efetiva é revalidada no servidor e na RLS. */
export function useStaffFinanceActions(): {
  hasAction: (action: FinanceActionKey) => boolean;
  loading: boolean;
} {
  const { profile } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [grants, setGrants] = useState<Grants | null>(null);
  const privileged = Boolean(profile?.active && (profile.role === "owner" || profile.role === "admin"));

  useEffect(() => {
    if (!profile || !profile.active || profile.role !== "operator") {
      setGrants(null);
      return;
    }
    let cancelled = false;
    const userId = profile.id;
    async function load(): Promise<void> {
      const [permissions, module] = await Promise.all([
        supabase.from("staff_finance_action_permissions")
          .select("action_key, allowed").eq("profile_id", userId),
        supabase.from("staff_module_visibility")
          .select("module_key, enabled").eq("profile_id", userId).eq("module_key", "financeiro"),
      ]);
      if (cancelled) return;
      setGrants({
        userId,
        allowed: new Set(permissions.error ? [] :
          (permissions.data ?? []).filter((item) => item.allowed).map((item) => item.action_key)),
        moduleEnabled: !module.error && Boolean(module.data?.[0]?.enabled),
      });
    }
    void load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [supabase, profile?.id, profile?.role, profile?.active]);

  const ready = Boolean(profile && grants && grants.userId === profile.id);
  return {
    hasAction: (action: FinanceActionKey) => privileged || Boolean(ready && grants?.moduleEnabled && grants.allowed.has(action)),
    loading: Boolean(profile?.active && profile.role === "operator" && !ready),
  };
}
