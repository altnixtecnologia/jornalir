import { notFound } from "next/navigation";
import { clientDisplayName, deriveCommercialSaleFinancialStatus } from "@ir/types";
import { CommercialSaleNotFoundError } from "@ir/core";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { CommercialSaleDetail } from "../../../../../features/comercial/CommercialSaleDetail";
import { CommercialContractPreparationPanel, type CommercialContractServiceView } from "../../../../../features/comercial/CommercialContractPreparationPanel";
import { CommercialSignersPreparationPanel, type CommercialSignerPreparation } from "../../../../../features/comercial/CommercialSignersPreparationPanel";
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
        .select("service_id,template_id,custom_values").eq("package_id",pkg.id),
      supabase.from("contract_templates")
        .select("id,group_id,version,title,category,active,variables")
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

  const issuedDocumentsResult = pkg && canReview.data === true
    ? await supabase.from("commercial_contract_documents")
      .select("id,service_id,title,template_version,sha256,issued_at")
      .eq("package_id", pkg.id).order("issued_at", {ascending:false})
    : null;
  const reviewEventsResult = pkg && canReview.data === true
    ? await supabase.from("commercial_contract_review_events")
      .select("id,event_type,note,occurred_at")
      .eq("package_id",pkg.id).order("occurred_at",{ascending:false})
    : null;
  const signerPreparationsResult = pkg && canReview.data === true
    ? await supabase.from("commercial_signature_preparations")
      .select("id,document_id,status,commercial_signature_participants(id,signer_role,signer_name,signer_email,signing_order)")
      .in("document_id",(issuedDocumentsResult?.data??[]).map(document=>document.id).length
        ? (issuedDocumentsResult?.data??[]).map(document=>document.id) : ["00000000-0000-0000-0000-000000000000"])
    : null;
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
        clientId={client.id}
        saleStatus={sale.status}
        defaultMode={(sale.itemsSnapshot?.length ?? 1) > 1 ? "combined" : "separate"}
        pkg={pkg && !contractLoadError ? {
          id: pkg.id,
          document_mode: pkg.document_mode as "combined" | "separate",
          status: pkg.status as "draft" | "pending_legal_review" | "legal_approved",
          services: (termsResult?.data ?? []) as CommercialContractServiceView[],
        } : null}
        canPrepare={canPrepare.data === true}
        canReview={canReview.data === true}
        issuedDocuments={issuedDocumentsResult?.data ?? []}
        reviewEvents={reviewEventsResult?.data ?? []}
        templateOptions={templates.map(({id,title,category,version,variables})=>({
          id,title,category:category??"",version,
          variables: (Array.isArray(variables) ? variables : []) as { key:string; label:string; required:boolean }[],
        }))}
        templateAssignments={(assignmentResult?.data ?? []).map(({service_id,template_id,custom_values})=>({
          serviceId:service_id??null,templateId:template_id,
          values: (custom_values ?? {}) as Record<string,string>,
        }))}
        loadError={contractLoadError ?? issuedDocumentsResult?.error?.message ?? reviewEventsResult?.error?.message}
      />
      <CommercialSignersPreparationPanel
        saleId={sale.id}
        documents={(issuedDocumentsResult?.data??[]).map(document=>({
          id:document.id,title:document.title,
        }))}
        preparations={(signerPreparationsResult?.data??[]) as CommercialSignerPreparation[]}
        canReview={canReview.data===true}
        loadError={signerPreparationsResult?.error?.message}
      />
    </>
  );
}
