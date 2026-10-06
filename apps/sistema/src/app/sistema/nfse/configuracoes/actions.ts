"use server";

import { revalidatePath } from "next/cache";
import type { NfseCertificateType, NfseCertificateStoredStatus, NfseEnvironment } from "@ir/types";
import { getIssuerConfigService } from "../../../../composition/nfse";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";

const PATH = "/sistema/nfse/configuracoes";
const ENTITY_TYPE = "nfse_issuer_config";

type ActionResult = { error: string } | void;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

export interface IssuerConfigFormInput {
  companyName: string;
  tradeName: string;
  cnpj: string;
  municipalRegistration: string;
  municipality: string;
  state: string;
  ibgeCode: string;
  taxRegime: string;
  specialTaxRegime: string;
  environment: NfseEnvironment;
  certificateType: NfseCertificateType;
  certificateStatus: NfseCertificateStoredStatus;
  certificateValidUntil: string;
  certificateReference: string;
  notes: string;
}

/**
 * Salva a configuração fiscal do emissor (Parte 1, item 4) — sempre
 * uma ação EXPLÍCITA do usuário; nenhum valor sugerido (CNPJ/IM/
 * município da Informativo Regional) é persistido sem o usuário
 * confirmar salvando este formulário.
 */
export async function saveIssuerConfigAction(input: IssuerConfigFormInput): Promise<ActionResult> {
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    const service = getIssuerConfigService(client);
    const existing = await service.getCurrent();
    const saved = await service.save({
      companyName: input.companyName,
      tradeName: input.tradeName,
      cnpj: input.cnpj,
      municipalRegistration: input.municipalRegistration,
      municipality: input.municipality,
      state: input.state,
      ibgeCode: input.ibgeCode,
      taxRegime: input.taxRegime,
      specialTaxRegime: input.specialTaxRegime,
      environment: input.environment,
      certificateType: input.certificateType,
      certificateStatus: input.certificateStatus,
      certificateValidUntil: input.certificateValidUntil,
      certificateReference: input.certificateReference,
      notes: input.notes,
    });
    // Nunca registra certificateReference/CNPJ/dados sensíveis em metadata — só a ação em si.
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: saved.id, action: existing ? "update" : "create" });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(PATH);
}
