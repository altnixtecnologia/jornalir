import { notFound } from "next/navigation";
import { ClientCompletionWizard } from "../../../features/clientes/ClientCompletionWizard";
import { clientCompletionTokenUsable, findClientCompletionToken } from "../../../lib/clientes/clientCompletionTokens";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ClientCompletionPage({ params }: { params: { token: string } }): Promise<JSX.Element> {
  const row = await findClientCompletionToken(params.token);
  if (!row) notFound();

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
      <h1>Complementar cadastro · Informativo Regional</h1>
      {clientCompletionTokenUsable(row) ? (
        <ClientCompletionWizard token={params.token} channel={row.channel} />
      ) : (
        <section className="form-section">
          <h2>{row.status === "completed" ? "Cadastro já concluído" : "Link indisponível"}</h2>
          <p>
            {row.status === "completed"
              ? "Este link já foi utilizado para concluir o cadastro. Em caso de dúvida, fale com a equipe do Informativo Regional."
              : "Este link foi revogado, expirou ou já foi utilizado. Solicite um novo link à equipe do Informativo Regional."}
          </p>
        </section>
      )}
    </main>
  );
}
