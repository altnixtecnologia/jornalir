import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCommercialSaleService } from "../../composition/comercial";
import { getClientService } from "../../composition/clientes";
import { qualifyCommercialClient } from "./commercialQualification";
import { commercialDocumentAmount } from "./commercialDocumentAmount";
import {
  buildCommercialContractPreview, type CommercialServiceForPreview,
} from "./commercialContractPreview";
import { renderCommercialLegalDraft } from "./commercialLegalDraft";
import { CONTRACTOR_FIELDS, missingCommercialLegalParties } from "./commercialPartyRequirements";

export interface IssuableCommercialDocument {
  serviceId: string | null;
  templateId: string;
  templateVersion: number;
  templateTitle: string;
  text: string;
}

/**
 * Compila apenas dados revisados na origem comercial. Nunca grava,
 * assina ou presume dados fiscais/contratuais. Usado ANTES da aprovação
 * e novamente ANTES de cada emissão, sem confiar em campos do navegador.
 */
export async function compileCommercialDocuments(
  supabase: SupabaseClient,
  saleId: string,
  packageId: string,
  expectedStatus: "pending_legal_review" | "legal_approved",
): Promise<IssuableCommercialDocument[]> {
  const { data: pkg, error: packageError } = await supabase
    .from("commercial_contract_packages")
    .select("id,commercial_sale_id,client_id,status,document_mode")
    .eq("id", packageId).eq("commercial_sale_id", saleId).maybeSingle();
  if (packageError || !pkg || pkg.status !== expectedStatus) {
    throw new Error("Contratação fora da etapa esperada. Atualize a venda antes de continuar.");
  }
  if (pkg.document_mode !== "combined" && pkg.document_mode !== "separate") {
    throw new Error("Agrupamento dos documentos inválido.");
  }
  const [{data:services,error:serviceError},{data:bindings,error:bindingError},sale,customer] =
    await Promise.all([
      supabase.from("commercial_contract_services")
        .select("id,item_ordinal,service_title,service_channel,source_snapshot,starts_on,ends_on,service_location,service_scope,execution_conditions")
        .eq("package_id", pkg.id).order("item_ordinal"),
      supabase.from("commercial_contract_template_assignments")
        .select("service_id,template_id,custom_values").eq("package_id",pkg.id),
      getCommercialSaleService(supabase).getById(saleId),
      getClientService(supabase).getById(pkg.client_id),
    ]);
  if (serviceError || bindingError) throw new Error(serviceError?.message ?? bindingError?.message);
  if (sale.clientId !== pkg.client_id) throw new Error("Cliente vinculado a outra venda.");
  const qualification = qualifyCommercialClient(customer);
  if (qualification.missing.length) {
    throw new Error("Complete a qualificação do cliente: " + qualification.missing.join("; "));
  }
  const entries = (services ?? []) as Array<CommercialServiceForPreview & {id:string}>;
  const preview = buildCommercialContractPreview({
    reference:sale.reference,clientName:qualification.variables["cliente.nome"],
    amount:sale.amount,mode:pkg.document_mode,services:entries,
  }, { forLegalInstrument:true });
  if (preview.missing.length) throw new Error("Corrija os serviços: " + preview.missing.join("; "));
  const slots = pkg.document_mode === "combined"
    ? [{serviceId:null as string|null,index:0,channel:"combined",price:commercialDocumentAmount("combined",sale.amount)}]
    : entries.map((item,index)=>({
        serviceId:item.id,index,channel:item.service_channel,
        price:commercialDocumentAmount("separate",sale.amount,item.source_snapshot),
      }));
  const rows = bindings ?? [];
  if (rows.length !== slots.length) {
    throw new Error("Cada documento precisa de um único modelo jurídico.");
  }
  const selected = slots.map(slot=>({
    ...slot,binding:rows.find(binding=>binding.service_id===slot.serviceId),
  }));
  if (selected.some(slot=>!slot.binding)) throw new Error("Há documento sem modelo jurídico.");

  const templateIds = [...new Set(selected.map(slot=>slot.binding!.template_id))];
  const {data:models,error:modelsError}=await supabase.from("contract_templates")
    .select("id,title,group_id,version,category,active,content,variables")
    .in("id",templateIds);
  if (modelsError || (models??[]).length !== templateIds.length) {
    throw new Error("Não foi possível localizar todos os modelos jurídicos.");
  }
  const modelMap = new Map((models??[]).map(model=>[model.id,model]));
  const groups = [...new Set((models??[]).map(model=>model.group_id))];
  const {data:versions,error:versionError}=await supabase.from("contract_templates")
    .select("group_id,version").in("group_id",groups);
  if (versionError) throw new Error("Não foi possível confirmar a versão jurídica.");

  // A qualificação da prestadora deve ser declarada expressamente pelo
  // modelo e conferida por pessoa autorizada; nunca presumir CNPJ/endereço.
  const contractorKeys = [...CONTRACTOR_FIELDS];
  return selected.map(slot=>{
    const model=modelMap.get(slot.binding!.template_id);
    if(!model || !model.active ||
       (versions??[]).some(row=>row.group_id===model.group_id && row.version>model.version)) {
      throw new Error("Modelo jurídico inativo ou superado. Devolva a contratação à revisão.");
    }
    const expected="commercial_"+slot.channel.trim().toLowerCase();
    const category=String(model.category??"").trim().toLowerCase();
    if(category!==expected && !(pkg.document_mode==="separate" && category==="commercial_generic")) {
      throw new Error("Modelo jurídico incompatível com a modalidade "+slot.channel+".");
    }
    const variables=Array.isArray(model.variables)
      ? model.variables as Array<{key:string;label:string;required:boolean}> : [];
    const declared=new Set(variables.map(v=>v.key));
    const absent=missingCommercialLegalParties(model.content, [...declared]);
    if(absent.length) {
      throw new Error("O modelo "+model.title+" não identifica corretamente as partes: "+absent.join(", ")+".");
    }
    const rendered=renderCommercialLegalDraft({
      templateText:model.content,reference:sale.reference,
      clientName:qualification.variables["cliente.nome"],
      totalPrice:slot.price.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}),
      document:preview.documents[slot.index],
      qualification:qualification.variables,
      values:(slot.binding!.custom_values??{}) as Record<string,string>,
      requiredVariables:[...variables,...contractorKeys.map(key=>({key,label:key,required:true}))],
      final:true,
    });
    if(rendered.missing.length) {
      throw new Error("Modelo "+model.title+": campos pendentes "+rendered.missing.join(", ")+".");
    }
    return {
      serviceId:slot.serviceId,templateId:model.id,
      templateVersion:model.version as number,templateTitle:model.title as string,
      text:rendered.text,
    };
  });
}
