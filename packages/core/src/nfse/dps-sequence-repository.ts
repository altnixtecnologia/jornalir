/**
 * Reserva atômica do próximo número de DPS (Parte 2A, item 5) — a
 * implementação real (Supabase) chama a RPC `reserve_next_dps_number`
 * (lock de linha, nunca duas reservas pegam o mesmo número). Nunca
 * reutilizado silenciosamente: cada chamada bem-sucedida incrementa a
 * sequência pra sempre, mesmo que a transmissão subsequente falhe.
 */
export interface DpsSequenceRepository {
  reserveNext(params: { issuerConfigId: string; environment: string; series: string }): Promise<number>;
}
