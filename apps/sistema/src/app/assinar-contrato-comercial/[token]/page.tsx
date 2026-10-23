import {notFound} from "next/navigation";
import {CommercialContractSignerCanvas} from "../../../features/comercial/CommercialContractSignerCanvas";
import {
 findCommercialInvitation,commercialInvitationPending,
} from "../../../lib/signatures/commercialSignatures";
export const dynamic="force-dynamic";
export const revalidate=0;
export default async function CommercialSignPage({params}:{params:{token:string}}):Promise<JSX.Element>{
 const invite=await findCommercialInvitation(params.token);
 if(!invite) notFound();
 const document=invite.commercial_signature_requests.commercial_signature_preparations.commercial_contract_documents;
 return <main style={{maxWidth:1000,margin:"0 auto",padding:"24px 16px"}}>
  <h1>Assinatura de contrato comercial · Informativo Regional</h1>
  {commercialInvitationPending(invite) ? (
   <CommercialContractSignerCanvas token={params.token}
    name={invite.commercial_signature_participants.signer_name}
    documentName={document.title} expiresAt={invite.expires_at}/>
  ) : (
   <section className="form-section">
    <h2>{invite.status==="signed"?"Assinatura registrada":"Convite indisponível"}</h2>
    <p>{invite.status==="signed"?"O comprovante e o documento assinado permanecem no histórico privado da contratação.":"Este link foi revogado, utilizado ou expirou."}</p>
   </section>
  )}
 </main>;
}
