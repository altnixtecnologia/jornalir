"use server";

import { revalidatePath } from "next/cache";
import type { NfseCertificateInfo } from "@ir/types";
import { CertificateService } from "@ir/core/src/nfse/certificate-service";
import { isSecretStoreConfigured } from "@ir/core/src/nfse/secret-store";
import { getIssuerConfigService, getCertificateService } from "../../../../composition/nfse";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";

const PATH = "/sistema/nfse/configuracoes";
const ENTITY_TYPE = "nfse_certificate";

type ActionResult = { error: string } | { certificate: NfseCertificateInfo };

async function requireFiscalAdmin(client: ReturnType<typeof createSupabaseServerClient>): Promise<void> {
  const { data: user, error: authError } = await client.auth.getUser();
  if (authError || !user.user) throw new Error("Faça login novamente.");
  const { data: profile, error } = await client.from("profiles")
    .select("active,role").eq("id", user.user.id).maybeSingle();
  if (error || !profile?.active || (profile.role !== "admin" && profile.role !== "owner")) {
    throw new Error("Somente administradores podem acessar o certificado fiscal.");
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível validar o certificado.";
}

/**
 * Upload do certificado A1 (Parte 2B) — a senha chega SÓ aqui, usada
 * só pra abrir o PFX (ver CertificateService.validateAndStore) e
 * NUNCA persistida, logada ou devolvida pro cliente. Mesmo em caso de
 * erro, a mensagem nunca inclui a senha/conteúdo do arquivo.
 *
 * Configuração/homologação (29/10/2026): esta ação é só cadastro local
 * (valida o PFX e grava no cofre/DB) — nunca transmite nem consulta
 * nada externamente, então fica disponível pra Proprietário/Admin
 * ativo mesmo com `NFSE_AVAILABLE_IN_THIS_RELEASE=false` (que continua
 * bloqueando só EMISSÃO: transmissão, cancelamento, consulta real de
 * parâmetros municipais). O gate de permissão é `requireFiscalAdmin`.
 */
export async function uploadCertificateAction(formData: FormData): Promise<ActionResult> {
  const file = formData.get("pfxFile");
  const password = formData.get("password");

  if (!(file instanceof File) || file.size === 0) return { error: "Selecione o arquivo do certificado (.pfx/.p12)." };
  if (!/\.p(?:fx|12)$/i.test(file.name)) return { error: "Selecione um arquivo PFX/P12 válido." };
  if (file.size > 2 * 1024 * 1024) return { error: "O arquivo de certificado deve ter até 2 MB." };
  if (typeof password !== "string" || password.length === 0) return { error: "Informe a senha do certificado." };
  if (!isSecretStoreConfigured()) return { error: "Cofre de certificados ainda não configurado no servidor." };

  try {
    const client = createSupabaseServerClient();
    await requireFiscalAdmin(client);
    const AUDIT = await getAuditContext(client);
    const issuerConfigService = getIssuerConfigService(client);
    const issuerConfig = await issuerConfigService.getCurrent();
    if (!issuerConfig) return { error: "Salve a configuração do prestador (CNPJ) antes de enviar o certificado." };

    const certificateService: CertificateService = getCertificateService();
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

/**
 * Consulta local (metadados do certificado já armazenado) — mesma
 * exceção de configuração/homologação acima: sem chamada externa.
 */
export async function getActiveCertificateAction(): Promise<NfseCertificateInfo | null> {
  const client = createSupabaseServerClient();
  await requireFiscalAdmin(client);
  const issuerConfigService = getIssuerConfigService(client);
  const issuerConfig = await issuerConfigService.getCurrent();
  if (!issuerConfig) return null;
  const certificateService = getCertificateService();
  return certificateService.getActiveInfo(issuerConfig.id);
}
