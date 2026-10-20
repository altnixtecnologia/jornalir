"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { createSupabaseBrowserClient } from "../supabase/browser";

/** Apenas para mostrar o atalho; autorizacao real validada no servidor e na RLS. */
export function useAuditReadAccess(): boolean {
  const { profile } = useAuth();
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [grant, setGrant] = useState<{ userId: string; canView: boolean } | null>(null);

  useEffect(() => {
    if (!profile?.active || profile.role !== "operator") return;
    let cancelled = false;
    const profileId = profile.id;
    async function reload(): Promise<void> {
      const { data, error } = await client.from("audit_viewer_grants")
        .select("can_view").eq("profile_id", profileId).maybeSingle();
      if (cancelled) return;
      setGrant({ userId: profileId, canView: !error && data?.can_view === true });
    }
    void reload();
    window.addEventListener("focus", reload);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", reload);
    };
  }, [client, profile?.id, profile?.active, profile?.role]);

  if (!profile?.active) return false;
  if (profile.role === "owner" || profile.role === "admin") return true;
  return grant?.userId === profile.id && grant.canView;
}
