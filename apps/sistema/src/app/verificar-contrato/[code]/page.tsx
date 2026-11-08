import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { checkPublicSignatureCode } from "../../../lib/signatures/publicVerificationServer";
import { VerifySignaturePdfClient } from "../../../features/assinaturas/VerifySignaturePdfClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Verificar assinatura eletrônica | Informativo Regional",
  robots: { index: false, follow: false },
};

export default async function VerifySignedDocumentPage({
  params,
}: { params: { code: string } }): Promise<JSX.Element> {
  const found = await checkPublicSignatureCode(params.code);
  if (!found) notFound();

  const date = new Date(found.signedAt).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short",
  });
  return (
    <main style={{ maxWidth: 760, margin: "48px auto", padding: "0 20px", lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 25, fontWeight: 700 }}>Verificação de assinatura eletrônica</h1>
      <p style={{ marginTop: 16 }}>Este QR Code corresponde a um <strong>aceite eletrônico registrado</strong> pelo sistema do Informativo Regional.</p>
      <dl style={{ padding: 16, border: "1px solid #cbd5e1", borderRadius: 8 }}>
        <dt><strong>Situação desta assinatura</strong></dt>
        <dd style={{ margin: "4px 0 16px" }}>Registrada em {date} (Brasília)</dd>
        <dt><strong>Documento completo</strong></dt>
        <dd style={{ margin: "4px 0 16px" }}>
          {found.complete ? "Rodada de assinaturas concluída." :
            "Este aceite foi registrado; outras assinaturas podem continuar pendentes."}
        </dd>
        <dt><strong>SHA-256 da versão deste aceite</strong></dt>
        <dd style={{ margin: "4px 0", overflowWrap: "anywhere", fontFamily: "monospace", fontSize: 13 }}>{found.sha256}</dd>
      </dl>
      <p>O código não fornece acesso ao PDF nem revela nome, CPF, e-mail ou outras informações privadas. A verificação é específica desta versão: se outras assinaturas forem acrescentadas, será criado um PDF consolidado com outro hash.</p>
      <VerifySignaturePdfClient expectedSha256={found.sha256} />
      <p style={{ marginTop: 24, fontSize: 13, color: "#475569" }}>
        Este registro é uma evidência técnica complementar de integridade e autoria; não equivale isoladamente a uma assinatura digital qualificada ICP-Brasil.
      </p>
    </main>
  );
}
