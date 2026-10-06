"use server";

import { revalidatePath } from "next/cache";
import type { NfseCertificateInfo } from "@ir/types";
import { CertificateService } from "@ir/core/src/nfse/certificate-service";
import { getIssuerConfigService, getCertificateService } from "../../../../composition/nfse";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";

const PATH = "/sistema/nfse/configuracoes";
const ENTITY_TYPE = "nfse_certificate";

type ActionResult = { error: string } | { certificate: NfseCertificateInfo };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível validar o certificado.";
}

/**
 * Upload do certificado A1 (Parte 2B) — a senha chega SÓ aqui, usada
 * só pra abrir o PFX (ver CertificateService.validateAndStore) e
 * NUNCA persistida, logada ou devolvida pro cliente. Mesmo em caso de
 * erro, a mensagem nunca inclui a senha/conteúdo do arquivo.
 */
export async function uploadCertificateAction(formData: FormData): Promise<ActionResult> {
  const file = formData.get("pfxFile");
  const password = formData.get("password");

  if (!(file instanceof File) || file.size === 0) return { error: "Selecione o arquivo do certificado (.pfx/.p12)." };
  if (typeof password !== "string" || password.length === 0) return { error: "Informe a senha do certificado." };

  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    const issuerConfigService = getIssuerConfigService(client);
    const issuerConfig = await issuerConfigService.getCurrent();
    if (!issuerConfig) return { error: "Salve a configuração do prestador (CNPJ) antes de enviar o certificado." };

    const certificateService: CertificateService = getCertificateService(client);
    const pfxBuffer = Buffer.from(await file.arrayBuffer());
    const certificate = await certificateService.validateAndStore({
      issuerConfigId: issuerConfig.id,
      expectedCnpjDigits: issuerConfig.cnpj.replace(/\D/g, ""),
      pfxBuffer,
      password,
      actorProfileId: AUDIT.actorId,
    });

    // Nunca registra senha/PFX/chave privada — só a ação e a identificação pública do certificado.
    await recordAuditEventSupabase(client, {
      userId: AUDIT.actorId,
      entityType: ENTITY_TYPE,
      entityId: certificate.id,
      action: "create",
    });

    revalidatePath(PATH);
    return { certificate };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function getActiveCertificateAction(): Promise<NfseCertificateInfo | null> {
  const client = createSupabaseServerClient();
  const issuerConfigService = getIssuerConfigService(client);
  const issuerConfig = await issuerConfigService.getCurrent();
  if (!issuerConfig) return null;
  const certificateService = getCertificateService(client);
  return certificateService.getActiveInfo(issuerConfig.id);
}
