"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { createSupabaseBrowserClient } from "../supabase/browser";

type ModuleReadAccess = { agendaRead: boolean; pautaRead: boolean; loading: boolean };

/** Navegação é só UX; quem efetivamente protege os dados é a RLS do banco. */
export function useAgendaPautaReadAccess(): ModuleReadAccess {
  const { profile } = useAuth();
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const privileged = profile?.role === "owner" || profile?.role === "admin";
  const [grants, setGrants] = useState<{ profileId: string; agenda: boolean; pauta: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!profile || privileged || profile.role !== "operator") return;

    // Refaz a consulta ao trocar a aba/sessão e evita atalhos desatualizados.
    async function reload(): Promise<void> {
      const { data, error } = await client.from("staff_module_permissions")
        .select("module_name,can_read")
        .eq("profile_id", profile!.id)
        .in("module_name", ["agenda", "pauta"]);
      if (cancelled) return;
      if (error) {
        // Falha de leitura: esconder os atalhos, nunca pressupor permissão.
        setGrants({ profileId: profile!.id, agenda: false, pauta: false });
        return;
      }
      setGrants({
        profileId: profile!.id,
        agenda: Boolean(data?.some((row) => row.module_name === "agenda" && row.can_read)),
        pauta: Boolean(data?.some((row) => row.module_name === "pauta" && row.can_read)),
      });
    }
    void reload();
    window.addEventListener("focus", reload);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", reload);
    };
  }, [client, profile?.id, profile?.role, privileged]);

  if (privileged) return { agendaRead: true, pautaRead: true, loading: false };
  if (!profile || profile.role !== "operator") {
    return { agendaRead: false, pautaRead: false, loading: false };
  }
  if (!grants || grants.profileId !== profile.id) {
    return { agendaRead: false, pautaRead: false, loading: true };
  }
  return { agendaRead: grants.agenda, pautaRead: grants.pauta, loading: false };
}
