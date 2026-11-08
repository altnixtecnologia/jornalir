import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildContractorProfile,
  type CompanyProfileRow,
  type ContractorProfile,
  type LegalRepresentativeRow,
} from "./contractorProfile";

/**
 * Carrega a CONTRATADA (Etapa 1) pela função estreita
 * `get_contract_contractor_profile` (20261122180000): empresa + representantes
 * ativos, sem imagem de assinatura, só para quem prepara/revisa contratos ou
 * é admin/owner. Tolera a ausência da função/tabelas (migrations ainda não
 * aplicadas) devolvendo "não configurado" — nunca quebra o fluxo anterior de
 * contratos nem inventa dados.
 */
const MISSING_CODES = new Set(["42883", "42P01", "PGRST202", "PGRST205", "PGRST200"]);

export async function loadContractorProfile(supabase: SupabaseClient, todayIso: string): Promise<ContractorProfile> {
  const { data, error } = await supabase.rpc("get_contract_contractor_profile");
  if (error) {
    if (MISSING_CODES.has(error.code ?? "")) return buildContractorProfile(null, [], todayIso);
    throw new Error("Não foi possível consultar os dados da empresa (contratada).");
  }
  const payload = (data ?? {}) as { company?: CompanyProfileRow | null; representatives?: LegalRepresentativeRow[] };
  return buildContractorProfile(payload.company ?? null, payload.representatives ?? [], todayIso);
}
