import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientNotFoundError } from "@ir/core";
import { CLIENT_KIND_LABELS, CLIENT_ROLE_LABELS, clientDisplayName } from "@ir/types";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { getClientService } from "../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

function formatDoc(kind: "individual" | "company", value: string | undefined): string {
  if (!value) return "—";
  return kind === "individual"
    ? value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

function Field({ label, value }: { label: string; value?: string | null }): JSX.Element {
  return (
    <div className="form-field">
      <span className="field-label">{label}</span>
      <span>{value || "—"}</span>
    </div>
  );
}

export default async function ClienteDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const client = await getClientService(supabase)
    .getById(params.id)
    .catch((error: unknown) => {
      if (error instanceof ClientNotFoundError) return null;
      throw error;
    });
  if (!client) notFound();

  const isIndividual = client.kind === "individual";

  return (
    <>
      <ModuleHeader
        eyebrow={`CLIENTES / ${client.reference}`}
        title={clientDisplayName(client)}
        description={CLIENT_KIND_LABELS[client.kind]}
        action={
          <div className="materias-toolbar-actions">
            <Link className="secondary-link" href={`/sistema/assinaturas/nova?clientId=${client.id}`}>
              Nova assinatura
            </Link>
            <Link className="form-action-primary" href={`/sistema/clientes/${client.id}/editar`}>
              Editar
            </Link>
          </div>
        }
      />

      <section className="form-section form-section--first">
        <h2>Dados principais</h2>
        <div className="form-grid">
          <Field label="Status" value={client.status === "active" ? "Ativo" : "Inativo"} />
          {isIndividual ? (
            <>
              <Field label="Nome completo" value={client.fullName} />
              <Field label="CPF" value={formatDoc("individual", client.cpf)} />
              <Field label="Data de nascimento" value={client.birthDate ? new Date(`${client.birthDate}T00:00:00`).toLocaleDateString("pt-BR") : undefined} />
            </>
          ) : (
            <>
              <Field label="Razão social" value={client.companyName} />
              <Field label="Nome fantasia" value={client.tradeName} />
              <Field label="CNPJ" value={formatDoc("company", client.cnpj)} />
              <Field label="Inscrição estadual" value={client.stateRegistration} />
              <Field label="Responsável" value={client.responsibleName} />
              <Field label="CPF do responsável" value={formatDoc("individual", client.responsibleCpf)} />
            </>
          )}
        </div>
      </section>

      <section className="form-section">
        <h2>Contatos</h2>
        <div className="form-grid">
          <Field label="Telefone principal" value={client.phonePrimary} />
          <Field label="Telefone secundário" value={client.phoneSecondary} />
          <Field label="WhatsApp" value={client.whatsapp} />
          <Field label="E-mail" value={client.email} />
        </div>
      </section>

      <section className="form-section">
        <h2>Endereço</h2>
        <div className="form-grid">
          <Field label="CEP" value={client.address.zip} />
          <Field label="Logradouro" value={client.address.street} />
          <Field label="Número" value={client.address.number} />
          <Field label="Complemento" value={client.address.complement} />
          <Field label="Bairro" value={client.address.neighborhood} />
          <Field label="Cidade" value={client.address.city} />
          <Field label="UF" value={client.address.state} />
        </div>
      </section>

      <section className="form-section">
        <h2>Papéis</h2>
        {client.roles.length === 0 ? (
          <p className="helper-text">Nenhum papel atribuído ainda.</p>
        ) : (
          <div className="form-grid">
            {client.roles.map((role) => (
              <span key={role} className="status-pill status-pill--published">
                {CLIENT_ROLE_LABELS[role]}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="form-section">
        <h2>Observações</h2>
        <p className="helper-text">{client.notes || "Nenhuma observação registrada."}</p>
      </section>

      <section className="form-section">
        <h2>Cadastro</h2>
        <div className="form-grid">
          <Field label="Data de cadastro" value={formatDate(client.createdAt)} />
          <Field label="Última atualização" value={formatDate(client.updatedAt)} />
        </div>
      </section>

      {/* Seções futuras (não implementadas nesta fase): Financeiro,
          Publicidade e Histórico de relacionamento vão ocupar este mesmo
          espaço, consultando por client_id. Assinaturas já tem módulo
          próprio (ação "Nova assinatura" acima / /sistema/assinaturas). */}
      <section className="form-section form-section--compact">
        <h2>Em breve</h2>
        <p className="helper-text">Financeiro, publicidade e histórico de relacionamento vão aparecer aqui em fases futuras.</p>
      </section>
    </>
  );
}
