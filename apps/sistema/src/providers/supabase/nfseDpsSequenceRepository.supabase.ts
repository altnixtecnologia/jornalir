import type { SupabaseClient } from "@supabase/supabase-js";
import type { DpsSequenceRepository } from "@ir/core";

/**
 * Reserva atômica do número de DPS (Parte 2A, item 5) — delega
 * inteiramente pra RPC `reserve_next_dps_number` (lock de linha no
 * banco, nunca uma checagem em memória). Nunca faz SELECT+UPDATE
 * separados aqui — isso reabriria a janela de corrida que a RPC existe
 * pra fechar.
 */
export function createDpsSequenceRepositorySupabase(client: SupabaseClient): DpsSequenceRepository {
  return {
    async reserveNext(params) {
      const { data, error } = await client.rpc("reserve_next_dps_number", {
        p_issuer_config_id: params.issuerConfigId,
        p_environment: params.environment,
        p_series: params.series,
      });
      if (error) throw new Error(error.message);
      return Number(data);
    },
  };
}
