import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { ConvertSubscriptionInterestButton } from "../../../../features/publicidade/ConvertSubscriptionInterestButton";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import {
  reviewSiteInterestAction,
  updateSiteInterestStatusAction,
  type SiteInterestAvailability,
  type SiteInterestStatus,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface InterestRow {
  id: string;
  request_type: "subscription" | "advertising" | "mixed";
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  company: string | null;
  customer_kind: "individual" | "company" | null;
  document_number: string | null;
  selections: unknown;
  estimated_total: number | null;
  notes: string | null;
  status: SiteInterestStatus;
  payment_preference: "pix" | "boleto" | "credit_card" | "cash" | "to_define" | null;
  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  availability_status: SiteInterestAvailability;
  approved_total: number | null;
  admin_note: string | null;
  created_at: string;
}

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function requestTypeLabel(value: InterestRow["request_type"]): string {
  if (value === "subscription") return "Assinatura";
  if (value === "advertising") return "Publicidade";
  return "Assinatura + publicidade";
}

function statusLabel(value: SiteInterestStatus): string {
  return { new: "Nova", contacted: "Em atendimento", converted: "Convertida", discarded: "Descartada" }[value];
}

function availabilityLabel(value: SiteInterestAvailability): string {
  return {
    pending: "Aguardando análise",
    approved: "Disponível/aprovada",
    unavailable: "Sem disponibilidade/rota",
    needs_info: "Precisa de informação",
  }[value];
}

function paymentLabel(value: InterestRow["payment_preference"]): string {
  return {
    pix: "Pix",
    boleto: "Boleto",
    credit_card: "Cartão",
    cash: "Dinheiro",
    to_define: "A definir",
  }[value ?? "to_define"];
}

function selectionLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const label = (item as Record<string, unknown>).label;
      return typeof label === "string" ? label : null;
    })
    .filter((item): item is string => Boolean(item));
}

function whatsappHref(row: InterestRow): string {
  const digits = row.phone.replace(/\D/g, "");
  const amount = row.approved_total ?? row.estimated_total;
  const lines = [
    `Olá, ${row.name.split(" ")[0]}! Aqui é do Informativo Regional.`,
    "",
    row.availability_status === "approved"
      ? "Analisamos sua solicitação e ela está disponível para seguirmos com a confirmação."
      : row.availability_status === "unavailable"
        ? "Analisamos sua solicitação e precisamos conversar sobre a disponibilidade/rota."
        : "Recebemos sua solicitação pelo site e estamos fazendo a análise.",
    amount !== null ? `Valor de referência: ${money(Number(amount))}.` : null,
    `Forma de pagamento indicada: ${paymentLabel(row.payment_preference)}.`,
    "",
    "Nenhuma cobrança é emitida sem a confirmação do atendimento.",
  ].filter(Boolean);
  return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function fullAddress(row: InterestRow): string | null {
  if (!row.address_street && !row.address_city) return null;
  return [
    [row.address_street, row.address_number].filter(Boolean).join(", "),
    row.address_complement,
    row.address_neighborhood,
    [row.address_city, row.address_state].filter(Boolean).join(" - "),
    row.address_zip ? `CEP ${row.address_zip}` : null,
  ].filter(Boolean).join(" · ");
}

export default async function SiteInterestRequestsPage(): Promise<JSX.Element> {
  const client = createSupabaseServerClient();
  const { data, error } = await client
    .from("site_interest_requests")
    .select("id, request_type, name, phone, email, city, company, customer_kind, document_number, selections, estimated_total, notes, status, payment_preference, address_zip, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, availability_status, approved_total, admin_note, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as InterestRow[];
  const newCount = rows.filter((row) => row.status === "new").length;

  return (
    <>
      <ModuleHeader
        eyebrow="COMERCIAL / SITE"
        title="Solicitações do site"
        description="Fila de assinatura e publicidade. Primeiro analisamos rota/disponibilidade; só depois confirmamos e enviamos a cobrança."
      />

      <ul className="quick-access-grid financeiro-kpi-grid">
        <li><div className="quick-access-card" style={{ cursor: "default" }}><span className="quick-access-label">{newCount}</span><span className="quick-access-description">Novas</span></div></li>
        <li><div className="quick-access-card" style={{ cursor: "default" }}><span className="quick-access-label">{rows.length}</span><span className="quick-access-description">Solicitações carregadas</span></div></li>
      </ul>

      <section className="form-section">
        <h2>Fila de atendimento</h2>
        {rows.length === 0 ? (
          <p className="helper-text">Nenhuma solicitação recebida até agora.</p>
        ) : (
          <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
            {rows.map((row) => {
              const labels = selectionLabels(row.selections);
              const address = fullAddress(row);
              const finalStatus = row.status === "converted" || row.status === "discarded";
              const canConvertSubscription =
                row.request_type === "subscription" &&
                row.availability_status === "approved" &&
                !finalStatus;

              return (
                <article key={row.id} style={{ border: "1px solid var(--line)", borderRadius: 6, background: "#fff", padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div className="helper-text">{formatDate(row.created_at)} · protocolo {row.id.slice(0,8).toUpperCase()}</div>
                      <h3 style={{ margin: "4px 0 0", fontSize: 16 }}>{row.name}</h3>
                      <div className="helper-text">
                        {row.company ? `${row.company} · ` : ""}
                        <a href={`https://wa.me/${row.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{row.phone}</a>
                        {row.email ? ` · ${row.email}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <span className="status-badge">{statusLabel(row.status)}</span>
                      <span className="status-badge">{availabilityLabel(row.availability_status)}</span>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginTop: 14 }}>
                    <div>
                      <strong style={{ fontSize: 12 }}>{requestTypeLabel(row.request_type)}</strong>
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                        {labels.map((label, index) => <li key={`${row.id}-${index}`} style={{ fontSize: 12 }}>{label}</li>)}
                      </ul>
                      <p className="helper-text" style={{ marginTop: 6 }}>
                        Estimativa: {row.estimated_total !== null ? money(Number(row.estimated_total)) : "Sob consulta"}
                      </p>
                    </div>

                    <div>
                      <strong style={{ fontSize: 12 }}>Pagamento preferido</strong>
                      <p className="helper-text" style={{ marginTop: 5 }}>{paymentLabel(row.payment_preference)}</p>
                      {row.customer_kind && row.document_number ? (
                        <>
                          <strong style={{ display: "block", marginTop: 10, fontSize: 12 }}>
                            {row.customer_kind === "company" ? "CNPJ" : "CPF"}
                          </strong>
                          <p className="helper-text" style={{ marginTop: 5 }}>{row.document_number}</p>
                        </>
                      ) : null}
                      {address ? (
                        <>
                          <strong style={{ display: "block", marginTop: 10, fontSize: 12 }}>Endereço / rota</strong>
                          <p className="helper-text" style={{ marginTop: 5 }}>{address}</p>
                        </>
                      ) : null}
                    </div>

                    <div>
                      {row.notes ? <><strong style={{ fontSize: 12 }}>Observação do cliente</strong><p className="helper-text" style={{ marginTop: 5 }}>{row.notes}</p></> : null}
                      {row.admin_note ? <><strong style={{ display: "block", marginTop: 10, fontSize: 12 }}>Observação interna</strong><p className="helper-text" style={{ marginTop: 5, whiteSpace: "pre-line" }}>{row.admin_note}</p></> : null}
                    </div>
                  </div>

                  {!finalStatus ? (
                    <form action={reviewSiteInterestAction.bind(null, row.id)} style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                      <div className="form-grid">
                        <label className="form-field">
                          <span className="field-label">Análise de rota/disponibilidade</span>
                          <select name="availability" defaultValue={row.availability_status}>
                            <option value="pending">Aguardando análise</option>
                            <option value="approved">Disponível / aprovada</option>
                            <option value="needs_info">Precisa de informação</option>
                            <option value="unavailable">Sem disponibilidade / fora da rota</option>
                          </select>
                        </label>
                        <label className="form-field">
                          <span className="field-label">Valor aprovado (R$)</span>
                          <input name="approvedTotal" inputMode="decimal" defaultValue={row.approved_total ?? row.estimated_total ?? ""} />
                        </label>
                        <label className="form-field" style={{ gridColumn: "1 / -1" }}>
                          <span className="field-label">Observação interna</span>
                          <input name="adminNote" defaultValue={row.admin_note ?? ""} />
                        </label>
                      </div>
                      <div className="form-actions" style={{ marginTop: 10 }}>
                        <button type="submit" className="form-action-primary">Salvar análise</button>
                        <a href={whatsappHref(row)} target="_blank" rel="noreferrer" className="button-link">Atender pelo WhatsApp</a>
                      </div>
                    </form>
                  ) : null}

                  <div className="form-actions" style={{ marginTop: 10, alignItems: "flex-start" }}>
                    {row.status === "new" ? (
                      <form action={updateSiteInterestStatusAction.bind(null,row.id,"contacted")}><button type="submit">Em atendimento</button></form>
                    ) : null}

                    {canConvertSubscription ? (
                      <ConvertSubscriptionInterestButton requestId={row.id} />
                    ) : null}

                    {row.request_type === "subscription" && !finalStatus && row.availability_status !== "approved" ? (
                      <span className="helper-text">Aprove a rota/disponibilidade antes de criar a assinatura e o financeiro.</span>
                    ) : null}

                    {row.request_type !== "subscription" && !finalStatus ? (
                      <form action={updateSiteInterestStatusAction.bind(null,row.id,"converted")}><button type="submit">Marcar convertida</button></form>
                    ) : null}

                    {!finalStatus ? (
                      <form action={updateSiteInterestStatusAction.bind(null,row.id,"discarded")}><button type="submit" className="media-remove-button">Descartar</button></form>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
