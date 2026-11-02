import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "../supabase/admin";

export interface ClientCompletionTokenRow {
  id: string;
  client_id: string;
  channel: "whatsapp" | "email";
  channel_value: string;
  status: "pending" | "verified" | "completed" | "expired" | "revoked";
  expires_at: string;
}

export function clientCompletionTokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Igual ao padrão de findCommercialInvitation (lib/signatures/commercialSignatures.ts). */
export async function findClientCompletionToken(token: string): Promise<ClientCompletionTokenRow | null> {
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("client_completion_tokens")
    .select("id,client_id,channel,channel_value,status,expires_at")
    .eq("token_sha256", clientCompletionTokenHash(token))
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as ClientCompletionTokenRow;
}

/** "Pendente" = ainda não verificado nem concluído. Não confundir com
 * tokenUsable, que também aceita 'verified' (sessão de OTP já confirmada,
 * mas o cadastro ainda não foi finalizado). */
export function clientCompletionTokenUsable(row: ClientCompletionTokenRow): boolean {
  return (row.status === "pending" || row.status === "verified") && Date.parse(row.expires_at) > Date.now();
}
