import { notFound } from "next/navigation";
import { clientDisplayName, deriveCommercialSaleFinancialStatus } from "@ir/types";
import { CommercialSaleNotFoundError } from "@ir/core";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { CommercialSaleDetail } from "../../../../../features/comercial/CommercialSaleDetail";
import { CommercialContractPreparationPanel, type CommercialContractServiceView } from "../../../../../features/comercial/CommercialContractPreparationPanel";
import { getCommercialProductService, getCommercialProposalService, getCommercialSaleService } from "../../../../../composition/comercial";
import { getClientService } from "../../../../../composition/clientes";
import { getDraftService } from "../../../../../composition/nfse";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { listReceivablesForCommercialSalesSupabase } from "../../../../../providers/supabase/receivableRepository.supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CommercialSaleDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const sale = await getCommercialSaleService(supabase)
    .getById(params.id)
    .catch((error: unknown) => {
      if (error instanceof CommercialSaleNotFoundError) return null;
      throw error;
    });
  if (!sale) notFound();

  const [client, products, receivables, nfseDraft, proposal] = await Promise.all([
    getClientService(supabase).getById(sale.clientId),
    getCommercialProductService(supabase).list({ activeOnly: true }),
    listReceivablesForCommercialSalesSupabase(supabase, [sale.id]),
    getDraftService(supabase).getByOrigin("jornal_ir", "commercial_sale", sale.id),
    sale.proposalId ? getCommercialProposalService(supabase).getById(sale.proposalId).catch(() => null) : Promise.resolve(null),
  ]);

  const [contractResult, canPrepare, canReview] = await Promise.all([
    supabase.from("commercial_contract_packages")
      .select("id,document_mode,status")
      .eq("commercial_sale_id", sale.id).maybeSingle(),
    supabase.rpc("staff_can_module_action", { p_module: "publicidade", p_action: "contratos_preparar" }),
    supabase.rpc("staff_can_module_action", { p_module: "publicidade", p_action: "contratos_revisar" }),
  ]);
  const pkg = contractResult.data;
  const termsResult = pkg
    ? await supabase.from("commercial_contract_services")
      .select("id,item_ordinal,source_snapshot,service_channel,service_title,starts_on,ends_on,service_location,service_scope,execution_conditions")
      .eq("package_id", pkg.id).order("item_ordinal")
    : null;
  const [assignmentResult, templateResult] = pkg && (canPrepare.data === true || canReview.data === true)
    ? await Promise.all([
      supabase.from("commercial_contract_template_assignments")
        .select("service_id,template_id").eq("package_id",pkg.id),
      supabase.from("contract_templates")
        .select("id,group_id,version,title,category,active")
        .like("category","commercial_%")
        .order("version",{ascending:false}),
    ]) : [null,null];
  // Somente a versão mais recente de cada família de modelos pode
  // ser selecionada. A RLS e o trigger repetem esta validação.
  const templateFamilies = new Set<string>();
  const templates = (templateResult?.data ?? []).filter(template => {
    if (templateFamilies.has(template.group_id)) return false;
    templateFamilies.add(template.group_id);
    return template.active === true;
  });
  const contractLoadError = contractResult.error?.message ?? termsResult?.error?.message
    ?? assignmentResult?.error?.message ?? templateResult?.error?.message
    ?? canPrepare.error?.message ?? canReview.error?.message;

  const financialStatus = deriveCommercialSaleFinancialStatus(receivables);

  return (
    <>
      <ModuleHeader eyebrow={`COMERCIAL / VENDAS / ${sale.reference}`} title={clientDisplayName(client)} description={`${sale.channel} — ${sale.description}`} />
      <CommercialSaleDetail
        sale={sale}
        clientName={clientDisplayName(client)}
        products={products}
        receivables={receivables}
        financialStatus={financialStatus}
        nfseDraft={nfseDraft}
        proposal={proposal}
      />
      <CommercialContractPreparationPanel
        saleId={sale.id}
        saleStatus={sale.status}
        pkg={pkg && !contractLoadError ? {
          id: pkg.id,
          document_mode: pkg.document_mode as "combined" | "separate",
          status: pkg.status as "draft" | "pending_legal_review",
          services: (termsResult?.data ?? []) as CommercialContractServiceView[],
        } : null}
        canPrepare={canPrepare.data === true}
        canReview={canReview.data === true}
        templateOptions={templates.map(({id,title,category,version})=>({id,title,category:category??"",version}))}
        templateAssignments={(assignmentResult?.data ?? []).map(({service_id,template_id})=>({
          serviceId:service_id??null,templateId:template_id,
        }))}
        loadError={contractLoadError}
      />
    </>
  );
}
