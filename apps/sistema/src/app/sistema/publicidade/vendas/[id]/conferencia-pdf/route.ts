import { NextRequest } from "next/server";
import { clientDisplayName } from "@ir/types";
import { getClientService } from "../../../../../../composition/clientes";
import { getCommercialSaleService } from "../../../../../../composition/comercial";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../../../lib/permissions/checkModuleAction";
import { buildContractTemplatePdf } from "../../../../../../lib/contracts/contractTemplatePdf";
import {
  buildCommercialContractPreview, type CommercialServiceForPreview,
} from "../../../../../../lib/contracts/commercialContractPreview";
import { renderCommercialLegalDraft } from "../../../../../../lib/contracts/commercialLegalDraft";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fail(message: string, status: number): Response {
  return new Response(message, {
    status, headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** PDF temporário para revisão; não salva, não assina, não cria cobrança. */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> {
  const [prepareDenied, reviewDenied] = await Promise.all([
    checkModuleAction("publicidade", "contratos_preparar"),
    checkModuleAction("publicidade", "contratos_revisar"),
  ]);
  if (prepareDenied && reviewDenied) return fail("Sem permissão para visualizar contratos comerciais.",403);

  try {
    const supabase = createSupabaseServerClient();
    const sale = await getCommercialSaleService(supabase).getById(params.id);
    const { data: pkg, error: pkgError } = await supabase
      .from("commercial_contract_packages")
      .select("id,client_id,document_mode")
      .eq("commercial_sale_id",sale.id).maybeSingle();
    if (pkgError || !pkg) return fail("Contratação comercial não encontrada.",404);

    const [{data:services,error:servicesError},{data:assignments,error:assignmentsError},client] =
      await Promise.all([
        supabase.from("commercial_contract_services")
          .select("id,item_ordinal,service_title,service_channel,source_snapshot,starts_on,ends_on,service_location,service_scope,execution_conditions")
          .eq("package_id",pkg.id).order("item_ordinal"),
        supabase.from("commercial_contract_template_assignments")
          .select("service_id,template_id,custom_values").eq("package_id",pkg.id),
        getClientService(supabase).getById(pkg.client_id),
      ]);
    if (servicesError || assignmentsError) return fail("Não foi possível conferir os serviços e modelos.",500);
    if (sale.clientId !== pkg.client_id) return fail("Cliente da venda não corresponde à contratação.",409);

    const mode = pkg.document_mode as "combined" | "separate";
    const entries = services ?? [];
    const serviceId = request.nextUrl.searchParams.get("service");
    const serviceIndex = mode === "separate"
      ? entries.findIndex(service => service.id === serviceId) : 0;
    if (mode === "separate" && serviceIndex < 0)
      return fail("Escolha qual serviço deseja conferir.",400);
    const selected = mode === "combined"
      ? (assignments ?? []).find(binding=>binding.service_id===null)
      : (assignments ?? []).find(binding=>binding.service_id===serviceId);
    if (!selected) return fail("Escolha um modelo jurídico antes de gerar a prévia.",422);

    const {data:template,error:templateError} = await supabase.from("contract_templates")
      .select("id,title,version,category,content,variables")
      .eq("id",selected.template_id).maybeSingle();
    if (templateError || !template) return fail("Modelo jurídico indisponível.",422);

    const preview = buildCommercialContractPreview({
      reference:sale.reference,clientName:clientDisplayName(client),
      amount:sale.amount,mode,services:entries as CommercialServiceForPreview[],
    });
    if (preview.missing.length) {
      return fail("Preencha os dados para conferência: " + preview.missing.join("; "),422);
    }
    const document = preview.documents[serviceIndex];
    if (!document) return fail("Nenhum documento correspondente ao serviço.",422);

    const text = renderCommercialLegalDraft({
      templateText:template.content, reference:sale.reference,
      clientName:clientDisplayName(client),
      totalPrice:sale.amount.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}),
      document,
      values:(selected.custom_values ?? {}) as Record<string,string>,
    });
    if (text.missing.length) {
      return fail("Há campos no modelo que precisam ser preenchidos: " + text.missing.join(", "),422);
    }

    const pdf = await buildContractTemplatePdf({
      title:"MINUTA PARA CONFERÊNCIA — NÃO ASSINAR",
      content:text.text,
      contractReference:sale.reference,
      templateTitle:template.title,
      templateVersion:template.version,
      generatedAt:new Date().toISOString(),
    });
    if (pdf.byteLength>4*1024*1024) return fail("Minuta muito extensa para download.",413);
    const safeName = sale.reference.replace(/[^a-zA-Z0-9_-]/g,"-").slice(0,48);
    return new Response(Buffer.from(pdf),{
      status:200,headers:{
        "Content-Type":"application/pdf",
        "Content-Disposition":'attachment; filename="minuta-'+safeName+'.pdf"',
        "Cache-Control":"private, no-store, max-age=0",
        "X-Content-Type-Options":"nosniff",
      },
    });
  } catch (err) {
    console.error("Erro na conferência PDF comercial:", err instanceof Error ? err.message : "unknown");
    return fail("Falha ao montar a minuta; confira os dados e o modelo.",500);
  }
}
