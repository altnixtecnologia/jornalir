"use server";

import { revalidatePath } from "next/cache";
import { getSubscriptionService } from "../../../../composition/assinaturas";
import { getCommercialSaleService } from "../../../../composition/comercial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createSupabaseAdminClient, hasServiceRoleKey } from "../../../../lib/supabase/admin";
import {
  CONTRACT_TEMPLATE_LABELS, CONTRACT_TEMPLATE_VERSIONS, identifyContractKind,
  type ContractTemplateKind,
} from "../../../../lib/contracts/contractTemplates";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type Kind = "assinatura" | "venda";
type Result = { ok: true; clientId: string; documentId: string } | { error: string };

/** Store only a non-signable draft. No PDF, invitation or billing is created here. */
export async function registerContractDraft(origin: Kind, id: string): Promise<Result> {
  if (!UUID.test(id) || (origin !== "assinatura" && origin !== "venda")) {
    return { error: "Origem do documento inválida." };
  }
  const db = createSupabaseServerClient();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) return { error: "Sessão inválida." };
  const { data: profile } = await db.from("profiles")
    .select("role,active").eq("id", auth.user.id).maybeSingle();
  if (!profile?.active || (profile.role !== "admin" && profile.role !== "owner")) {
    return { error: "Somente administradores podem registrar minutas nesta fase." };
  }
  if (!hasServiceRoleKey()) return { error: "Registro de minutas indisponível nesta instalação." };

  let clientId = "";
  let template: ContractTemplateKind;
  let sourceKind: "subscription" | "commercial_sale";
  try {
    if (origin === "assinatura") {
      const subscription = await getSubscriptionService(db).getById(id);
      if (subscription.serviceType !== "impresso" || subscription.periodicity !== "annual" || subscription.status === "cancelled") {
        return { error: "Esta assinatura não pode gerar o modelo anual do impresso." };
      }
      clientId = subscription.clientId;
      template = "annual_print";
      sourceKind = "subscription";
    } else {
      const sale = await getCommercialSaleService(db).getById(id);
      if (sale.status === "cancelled") return { error: "Venda cancelada não pode gerar contrato." };
      clientId = sale.clientId;
      template = identifyContractKind(sale.channel);
      sourceKind = "commercial_sale";
    }
  } catch {
    return { error: "Cadastro de origem não encontrado ou acesso não permitido." };
  }

  // Only after verifying user permission and source ownership may the service key be used.
  const admin = createSupabaseAdminClient();
  const { data: masterClient, error: clientError } = await admin.from("clients")
    .select("id").eq("id", clientId).maybeSingle();
  if (clientError || !masterClient) return { error: "O cliente mestre não foi encontrado." };

  const { data: versions, error: versionError } = await admin.from("client_contract_documents")
    .select("id,client_id,status,revision").eq("source_kind", sourceKind).eq("source_id", id)
    .order("revision", { ascending: false }).limit(1);
  if (versionError) return { error: "Estrutura de documentos ainda não homologada no banco." };
  const latest = versions?.[0];
  if (latest && latest.client_id !== clientId) {
    return { error: "A origem está vinculada a outro cliente. Confira antes de prosseguir." };
  }
  if (latest && ["draft", "ready", "awaiting_signature", "partially_signed"].includes(latest.status)) {
    return { ok: true, clientId, documentId: latest.id };
  }
  const { data: created, error } = await admin.from("client_contract_documents")
    .insert({
      client_id: clientId, source_kind: sourceKind, source_id: id,
      revision: (latest?.revision || 0) + 1,
      template_version: CONTRACT_TEMPLATE_VERSIONS[template],
      title: CONTRACT_TEMPLATE_LABELS[template],
      status: "draft", created_by: auth.user.id,
    }).select("id").single();
  if (error || !created) {
    // Concurrent requests hit the unique (source_kind,source_id,revision) index.
    return { error: "Não foi possível registrar esta minuta. Atualize e confira se já existe uma versão." };
  }
  revalidatePath(`/sistema/clientes/${clientId}`);
  return { ok: true, clientId, documentId: created.id };
}
