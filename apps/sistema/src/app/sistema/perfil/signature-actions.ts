"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { checkContractSigningGrant } from "../../../lib/permissions/checkContractSigningGrant";
import { MAX_SIGNATURE_PNG_BYTES, storeSignatureImage } from "../../../lib/contracts/signatureImage";
import { createSignatureSignedUrl, uploadSignatureObject } from "../../../lib/contracts/signatureImageStorage";

/**
 * Meu perfil → assinatura PNG (Etapa 1 do plano de Contratos, 08/11/2026).
 * Só quem tem a concessão EXPLÍCITA `publicidade.contratos_assinar` (inclusive
 * administrador e proprietário — o papel não presume esse poder) vê, envia,
 * troca ou remove — conferido AQUI no servidor (não só escondendo o bloco na tela), na RLS de
 * `staff_signature_images` e no bucket privado (sem policy; só service role).
 * A imagem é só representação gráfica: nunca assina nada por si.
 *
 * O usuário só mexe na PRÓPRIA imagem: o id vem da sessão, nunca do
 * navegador.
 */

type Result<T = object> = { error: string } | ({ ok: true } & T);

export interface MySignatureState {
  authorized: boolean;
  hasImage: boolean;
  previewUrl?: string;
  sha256?: string;
  sizeBytes?: number;
  updatedAt?: string;
}

async function currentUserId(client: ReturnType<typeof createSupabaseServerClient>): Promise<string | null> {
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : data.user.id;
}

/** Quem não tem a permissão recebe `authorized:false` e nada mais — o bloco nem aparece. */
export async function getMySignatureStateAction(): Promise<Result<{ state: MySignatureState }>> {
  const denied = await checkContractSigningGrant();
  if (denied) return { ok: true, state: { authorized: false, hasImage: false } };
  const client = createSupabaseServerClient();
  const userId = await currentUserId(client);
  if (!userId) return { error: "Sessão inválida. Faça login novamente." };
  try {
    const { data, error } = await client
      .from("staff_signature_images")
      .select("storage_path, sha256, size_bytes, updated_at")
      .eq("profile_id", userId)
      .maybeSingle();
    if (error) return { error: "Não foi possível consultar a sua assinatura." };
    if (!data) return { ok: true, state: { authorized: true, hasImage: false } };
    return {
      ok: true,
      state: {
        authorized: true,
        hasImage: true,
        previewUrl: await createSignatureSignedUrl(data.storage_path as string),
        sha256: data.sha256 as string,
        sizeBytes: data.size_bytes as number,
        updatedAt: data.updated_at as string,
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível exibir a sua assinatura." };
  }
}

/** FormData: `file` (PNG). Valida os bytes (não confia no tipo enviado), grava em bucket privado versionado por hash. */
export async function uploadMySignatureAction(formData: FormData): Promise<Result<{ sha256: string }>> {
  const denied = await checkContractSigningGrant();
  if (denied) return { error: "Você não tem permissão para cadastrar assinatura." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo PNG." };
  if (file.size > MAX_SIGNATURE_PNG_BYTES) return { error: "A imagem da assinatura deve ter no máximo 512 KB." };

  const client = createSupabaseServerClient();
  const userId = await currentUserId(client);
  if (!userId) return { error: "Sessão inválida. Faça login novamente." };

  const stored = await storeSignatureImage(
    { kind: "profile", ownerId: userId, bytes: new Uint8Array(await file.arrayBuffer()) },
    {
      upload: uploadSignatureObject,
      persist: async (meta) => {
        // Escrita só pelo servidor (service role): a tabela não tem policy de
        // insert/update para usuários. A permissão já foi conferida acima.
        const { createSupabaseAdminClient } = await import("../../../lib/supabase/admin");
        const { error } = await createSupabaseAdminClient()
          .from("staff_signature_images")
          .upsert(
            {
              profile_id: userId,
              storage_path: meta.path,
              sha256: meta.sha256,
              size_bytes: meta.sizeBytes,
              width: meta.width,
              height: meta.height,
              updated_by: userId,
            },
            { onConflict: "profile_id" },
          );
        if (error) throw new Error("Não foi possível registrar a sua assinatura.");
      },
    },
  );
  if (!stored.ok) return { error: stored.error };
  revalidatePath("/sistema/perfil");
  return { ok: true, sha256: stored.sha256 };
}

export async function removeMySignatureAction(): Promise<Result> {
  const denied = await checkContractSigningGrant();
  if (denied) return { error: "Você não tem permissão para gerenciar assinatura." };
  const client = createSupabaseServerClient();
  const userId = await currentUserId(client);
  if (!userId) return { error: "Sessão inválida. Faça login novamente." };
  try {
    const { createSupabaseAdminClient } = await import("../../../lib/supabase/admin");
    const { error } = await createSupabaseAdminClient().from("staff_signature_images").delete().eq("profile_id", userId);
    if (error) return { error: "Não foi possível remover a sua assinatura." };
    revalidatePath("/sistema/perfil");
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível remover a sua assinatura." };
  }
}
