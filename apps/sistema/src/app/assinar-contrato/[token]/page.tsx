import { notFound } from "next/navigation";
import { ContractSignerCanvas } from "../../../features/financeiro/ContractSignerCanvas";
import {
  findSignatureInvitation, findInvitationSource, invitationIsPending,
} from "../../../lib/signatures/contractSignatures";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SignContractPage({
  params,
}: { params: { token: string } }): Promise<JSX.Element> {
  const invitation = await findSignatureInvitation(params.token);
  if (!invitation) notFound();
  const source = await findInvitationSource(invitation);
  if (!source) notFound();
  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px" }}>
      <h1>Assinatura de documento · Informativo Regional</h1>
      {invitationIsPending(invitation) ? (
        <ContractSignerCanvas token={params.token} name={invitation.signer_name}
          documentName={source.filename} expiresAt={invitation.expires_at} />
      ) : (
        <section className="form-section">
          <h2>{invitation.status === "signed" ? "Documento já assinado" : "Convite indisponível"}</h2>
          <p>{invitation.status === "signed"
            ? "Este convite foi concluído. O comprovante está disponível com o responsável pelo contrato."
            : "O convite está revogado, expirado ou não está mais disponível."}</p>
        </section>
      )}
    </main>
  );
}
