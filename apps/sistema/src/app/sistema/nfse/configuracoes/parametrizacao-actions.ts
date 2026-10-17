"use server";

import { NFSE_INITIAL_SERVICE_REFERENCE, NFSE_SUGGESTED_ISSUER_DEFAULTS, type NfseMunicipalParametersResult } from "@ir/types";
import { NfseIntegrationError } from "@ir/core/src/nfse/integration-errors";
import { NfseMunicipalParametersClient } from "@ir/core/src/nfse/municipal-parameters-client";
import { createMutualTlsDispatcher } from "@ir/core/src/nfse/mutual-tls";
import { getCertificateService, getIssuerConfigService } from "../../../../composition/nfse";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";

export type MunicipalParametersActionResult =
  | { ok: true; data: NfseMunicipalParametersResult }
  | { ok: false; code: string; error: string };

/**
 * Mesmo gate de certificado-actions.ts (requireFiscalAdmin) — admin/owner
 * ATIVO, revalidado no banco a cada chamada (nunca confia em metadata de
 * sessão antiga). Consulta ao ADN usa o certificado do prestador, então
 * exige a mesma autorização que protege o upload/leitura do certificado.
 */
async function requireFiscalAdmin(client: ReturnType<typeof createSupabaseServerClient>): Promise<string> {
  const { data: user, error: authError } = await client.auth.getUser();
  if (authError || !user.user) throw new Error("Faça login novamente.");
  const { data: profile, error } = await client.from("profiles").select("active,role").eq("id", user.user.id).maybeSingle();
  if (error || !profile?.active || (profile.role !== "admin" && profile.role !== "owner")) {
    throw new Error("Somente administradores podem consultar a parametrização municipal da NFS-e.");
  }
  return user.user.id;
}

function toAdnCompetence(competenceDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competenceDate) || Number.isNaN(Date.parse(`${competenceDate}T00:00:00.000Z`))) {
    throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "Informe uma competência válida para consultar o ADN.");
  }
  return `${competenceDate}T00:00:00.000Z`;
}

/**
 * Consulta real ao ADN (convênio + alíquota) pra São João do Sul —
 * município/CNPJ de referência deste projeto (NFSE_SUGGESTED_ISSUER_
 * DEFAULTS/NFSE_INITIAL_SERVICE_REFERENCE nunca são valores inventados
 * pela aplicação, são os dados reais do prestador). Nunca executa sem
 * admin/owner ativo, nunca sem certificado A1 válido já configurado
 * (usa o material de assinatura só em memória, via mTLS — a chave
 * privada nunca sai do processo Node, nunca é logada). Audita a
 * consulta (ação, ator, entidade) SEM registrar nenhum segredo.
 */
export async function querySaoJoaoDoSulParametersAction(competenceDate: string): Promise<MunicipalParametersActionResult> {
  const sessionClient = createSupabaseServerClient();
  let dispatcher: ReturnType<typeof createMutualTlsDispatcher> | undefined;
  try {
    const actorId = await requireFiscalAdmin(sessionClient);
    const issuerConfigService = getIssuerConfigService(sessionClient);
    const issuerConfig = await issuerConfigService.getCurrent();
    if (!issuerConfig) {
      return { ok: false, code: "CERTIFICATE_NOT_CONFIGURED", error: "Salve primeiro a configuração do prestador." };
    }

    const certificateService = getCertificateService();
    const material = await certificateService.getActiveSigningMaterial(issuerConfig.id);
    if (!material) {
      return { ok: false, code: "CERTIFICATE_NOT_CONFIGURED", error: "Configure um certificado A1 válido antes de consultar o ADN." };
    }

    dispatcher = createMutualTlsDispatcher(material.certificatePem, material.privateKeyPem);
    const client = new NfseMunicipalParametersClient(dispatcher);
    const data = await client.queryMunicipalityAndService({
      municipalityCode: NFSE_SUGGESTED_ISSUER_DEFAULTS.ibgeCode,
      serviceCode: NFSE_INITIAL_SERVICE_REFERENCE.nationalTaxCode,
      competence: toAdnCompetence(competenceDate),
      environment: "homologation",
    });

    await recordAuditEventSupabase(sessionClient, {
      userId: actorId,
      entityType: "nfse_municipal_parameters",
      entityId: issuerConfig.id,
      action: "query_restricted",
    });
    return { ok: true, data };
  } catch (error) {
    if (error instanceof NfseIntegrationError) return { ok: false, code: error.code, error: error.message };
    return { ok: false, code: "NFSE_HTTP_ERROR", error: "Não foi possível consultar a parametrização municipal." };
  } finally {
    await dispatcher?.close().catch(() => undefined);
  }
}
