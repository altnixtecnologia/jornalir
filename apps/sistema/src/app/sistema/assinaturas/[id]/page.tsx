import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SubscriptionNotFoundError } from "@ir/core";
import {
  SUBSCRIPTION_PERIODICITY_LABELS,
  SUBSCRIPTION_SERVICE_TYPE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  clientDisplayName,
} from "@ir/types";
import { ClientNotFoundError } from "@ir/core";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { getSubscriptionService } from "../../../../composition/assinaturas";
import { getClientService } from "../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

function Field({ label, value }: { label: string; value?: ReactNode }): JSX.Element {
  return (
    <div className="form-field">
      <span className="field-label">{label}</span>
      <span>{value || "—"}</span>
    </div>
  );
}

export default async function AssinaturaDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const subscription = await getSubscriptionService(supabase)
    .getById(params.id)
    .catch((error: unknown) => {
      if (error instanceof SubscriptionNotFoundError) return null;
      throw error;
    });
  if (!subscription) notFound();

  const client = await getClientService(supabase)
    .getById(subscription.clientId)
    .catch((error: unknown) => {
      if (error instanceof ClientNotFoundError) return null;
      throw error;
    });

  return (
    <>
      <ModuleHeader
        eyebrow={`ASSINATURAS / ${subscription.reference}`}
        title={SUBSCRIPTION_SERVICE_TYPE_LABELS[subscription.serviceType]}
        description={client ? clientDisplayName(client) : "Cliente não encontrado"}
        action={
          <Link className="form-action-primary" href={`/sistema/assinaturas/${subscription.id}/editar`}>
            Editar
          </Link>
        }
      />

      <section className="form-section form-section--first">
        <h2>Cliente</h2>
        <div className="form-grid">
          <Field
            label="Cliente"
            value={
              client ? (
                <Link className="materia-title-link" href={`/sistema/clientes/${client.id}`}>
                  {clientDisplayName(client)}
                </Link>
              ) : undefined
            }
          />
          <Field label="Referência do cliente" value={client?.reference} />
        </div>
      </section>

      <section className="form-section">
        <h2>Serviço</h2>
        <div className="form-grid">
          <Field label="Tipo de serviço" value={SUBSCRIPTION_SERVICE_TYPE_LABELS[subscription.serviceType]} />
          <Field label="Status" value={SUBSCRIPTION_STATUS_LABELS[subscription.status]} />
          <Field label="Periodicidade" value={SUBSCRIPTION_PERIODICITY_LABELS[subscription.periodicity]} />
          <Field label="Valor" value={formatAmount(subscription.amount)} />
        </div>
      </section>

      <section className="form-section">
        <h2>Datas</h2>
        <div className="form-grid">
          <Field label="Início" value={formatDate(subscription.startsAt)} />
          <Field label="Vencimento" value={formatDate(subscription.dueDate)} />
        </div>
      </section>

      <section className="form-section">
        <h2>Observações</h2>
        <p className="helper-text">{subscription.notes || "Nenhuma observação registrada."}</p>
      </section>

      <section className="form-section">
        <h2>Cadastro</h2>
        <div className="form-grid">
          <Field label="Data de cadastro" value={formatDateTime(subscription.createdAt)} />
          <Field label="Última atualização" value={formatDateTime(subscription.updatedAt)} />
        </div>
      </section>

      {/* Seções futuras (não implementadas nesta fase): cobrança, contas a
          receber e histórico de pagamento vão ocupar este mesmo espaço. */}
      <section className="form-section form-section--compact">
        <h2>Em breve</h2>
        <p className="helper-text">Cobrança, contas a receber e histórico de pagamento vão aparecer aqui em fases futuras (Financeiro).</p>
      </section>
    </>
  );
}
