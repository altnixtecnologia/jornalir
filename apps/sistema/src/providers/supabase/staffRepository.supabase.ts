import type { SupabaseClient } from "@supabase/supabase-js";

export interface StaffOption {
  id: string;
  name: string;
}

/**
 * Lista enxuta do staff ativo — usada só para preencher seletores (ex.:
 * "quem efetivamente recebeu" num recebimento financeiro). Reaproveita
 * public.profiles (mecanismo de usuários já existente) — nunca um
 * cadastro paralelo de pessoas.
 */
export async function listActiveStaffSupabase(client: SupabaseClient): Promise<StaffOption[]> {
  const { data, error } = await client.from("profiles").select("id, name").eq("active", true).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as StaffOption[];
}
