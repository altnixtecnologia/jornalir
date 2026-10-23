import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "../../../../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../../../../lib/permissions/checkModuleAction";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function deny(message:string,status:number):Response {
  return new Response(message,{status,headers:{
    "Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff",
  }});
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request:Request,
  {params}:{params:{id:string;documentId:string}},
):Promise<Response> {
  if(!uuid.test(params.id)||!uuid.test(params.documentId)) return deny("Documento inválido.",400);
  const supabase=createSupabaseServerClient();
  const [denied,{data:financeAllowed,error:financeError}] = await Promise.all([
    checkModuleAction("publicidade","contratos_revisar"),
    supabase.rpc("staff_can_see_module",{p_module:"financeiro"}),
  ]);
  if(denied && (financeError || financeAllowed!==true)) return deny("Sem autorização.",403);
  const {data:pkg,error:pkgError}=await supabase.from("commercial_contract_packages")
    .select("id").eq("commercial_sale_id",params.id).maybeSingle();
  if(pkgError||!pkg) return deny("Contratação não localizada.",404);
  const {data:doc,error:docError}=await supabase.from("commercial_contract_documents")
    .select("id,file_reference,sha256,size_bytes")
    .eq("package_id",pkg.id).eq("id",params.documentId).maybeSingle();
  if(docError||!doc) return deny("Documento não encontrado ou sem permissão.",404);
  const expectedPath="commercial-contracts/"+pkg.id+"/"+doc.id+".pdf";
  if(doc.file_reference!==expectedPath) return deny("Referência privada incompatível.",409);
  const {data:file,error:storageError}=await supabase.storage.from("contract-documents").download(doc.file_reference);
  if(storageError||!file) return deny("Arquivo privado indisponível.",404);
  const bytes=Buffer.from(await file.arrayBuffer());
  if(bytes.byteLength!==doc.size_bytes||
     createHash("sha256").update(bytes).digest("hex")!==doc.sha256) {
    return deny("Integridade do PDF não confirmada. Verifique a evidência.",409);
  }
  return new Response(bytes,{status:200,headers:{
    "Content-Type":"application/pdf",
    "Content-Disposition":'attachment; filename="contrato-comercial-'+doc.id+'.pdf"',
    "Cache-Control":"private, no-store, max-age=0",
    "X-Content-Type-Options":"nosniff",
    "Content-Length":String(bytes.byteLength),
  }});
}
