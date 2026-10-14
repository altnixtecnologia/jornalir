import Link from "next/link";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { ConvertSubscriptionInterestButton } from "../../../../features/publicidade/ConvertSubscriptionInterestButton";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import {
  markSiteInterestAttendedAction,
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
  route_reference: string | null;
  location_url: string | null;
  availability_status: SiteInterestAvailability;
  approved_total: number | null;
  admin_note: string | null;
  converted_client_id: string | null;
  converted_subscription_id: string | null;
  converted_receivable_id: string | null;
  converted_proposal_id: string | null;
  converted_at: string | null;
  attended_at: string | null;
  created_at: string;
}

type PaidFilter = "" | "yes" | "no";
type Tab = "open" | "attended";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function cleanFilter(value: string): string {
  return value.trim().replace(/[%_,()]/g, " ").replace(/\s+/g, " ").slice(0, 120);
}

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function nextDay(value: string): string {
  const date = new Date(value + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
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

function fullAddress(row: InterestRow): string | null {
  if (!row.address_street && !row.address_city) return null;
  return [
    [row.address_street, row.address_number].filter(Boolean).join(", "),
    row.address_complement,
    row.address_neighborhood,
    [row.address_city, row.address_state].filter(Boolean).join(" - "),
    row.address_zip ? "CEP " + row.address_zip : null,
  ].filter(Boolean).join(" · ");
}

function compactLocation(row: InterestRow): string {
  return [
    row.address_neighborhood,
    row.address_city,
    row.route_reference,
  ].filter(Boolean).join(" · ") || "Local não informado";
}

function whatsappHref(row: InterestRow): string {
  const digits = row.phone.replace(/\D/g, "");
  const amount = row.approved_total ?? row.estimated_total;
  const lines = [
    "Olá, " + row.name.split(" ")[0] + "! Aqui é do Informativo Regional.",
    "",
    row.availability_status === "approved"
      ? "Analisamos sua solicitação e ela está disponível para seguirmos com a confirmação."
      : row.availability_status === "unavailable"
        ? "Analisamos sua solicitação e precisamos conversar sobre a disponibilidade/rota."
        : "Recebemos sua solicitação pelo site e estamos fazendo a análise.",
    amount !== null ? "Valor de referência: " + money(Number(amount)) + "." : null,
    "Forma de pagamento indicada: " + paymentLabel(row.payment_preference) + ".",
    "",
    "Nenhuma cobrança é emitida sem a confirmação do atendimento.",
  ].filter(Boolean);
  return "https://wa.me/" + digits + "?text=" + encodeURIComponent(lines.join("\n"));
}

function tabHref(tab: Tab, searchParams: Record<string, string | string[] | undefined> | undefined): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  for (const key of ["q", "date", "local", "paid"]) {
    const current = one(searchParams?.[key]);
    if (current) params.set(key, current);
  }
  return "/sistema/publicidade/solicitacoes?" + params.toString();
}

export default async function SiteInterestRequestsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const client = createSupabaseServerClient();
  const tab: Tab = one(searchParams?.tab) === "attended" ? "attended" : "open";
  const q = cleanFilter(one(searchParams?.q));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(one(searchParams?.date)) ? one(searchParams?.date) : "";
  const local = cleanFilter(one(searchParams?.local));
  const paidRaw = one(searchParams?.paid);
  const paid: PaidFilter = paidRaw === "yes" || paidRaw === "no" ? paidRaw : "";

  let query = client
    .from("site_interest_requests")
    .select(
      "id, request_type, name, phone, email, company, customer_kind, document_number, selections, estimated_total, notes, status, payment_preference, " +
      "address_zip, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, route_reference, location_url, " +
      "availability_status, approved_total, admin_note, converted_client_id, converted_subscription_id, converted_receivable_id, converted_proposal_id, converted_at, attended_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(300);

  query = tab === "open" ? query.is("attended_at", null) : query.not("attended_at", "is", null);
  if (q) query = query.ilike("name", "%" + q + "%");
  if (date) {
    query = query
      .gte("created_at", date + "T00:00:00-03:00")
      .lt("created_at", nextDay(date) + "T00:00:00-03:00");
  }
  if (local) {
    const pattern = "%" + local + "%";
    query = query.or(
      "address_city.ilike." + pattern +
      ",address_neighborhood.ilike." + pattern +
      ",address_street.ilike." + pattern +
      ",route_reference.ilike." + pattern,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as InterestRow[];
  const receivableIds = [...new Set(rows.map((row) => row.converted_receivable_id).filter((id): id is string => Boolean(id)))];
  const paidByReceivable = new Map<string, boolean>();
  if (receivableIds.length) {
    const receivables = await client.from("receivables").select("id, status").in("id", receivableIds);
    if (receivables.error) throw new Error(receivables.error.message);
    for (const item of receivables.data ?? []) paidByReceivable.set(item.id, item.status === "paid");
  }

  const filteredRows = rows.filter((row) => {
    if (!paid) return true;
    const isPaid = row.converted_receivable_id ? paidByReceivable.get(row.converted_receivable_id) === true : false;
    return paid === "yes" ? isPaid : !isPaid;
  });

  return (
    <>
      <ModuleHeader
        eyebrow="COMERCIAL / SITE"
        title="Solicitações do site"
        description="Fila compacta para acompanhar rota, atendimento e pagamento sem perder o histórico."
      />

      <div className="interest-tabs">
        <Link href={tabHref("open", searchParams)} className={tab === "open" ? "is-active" : ""}>Em aberto</Link>
        <Link href={tabHref("attended", searchParams)} className={tab === "attended" ? "is-active" : ""}>Atendidas</Link>
      </div>

      <form className="interest-filters" method="get" action="/sistema/publicidade/solicitacoes">
        <input type="hidden" name="tab" value={tab} />
        <label><span>Nome</span><input name="q" defaultValue={q} placeholder="Buscar nome" /></label>
        <label><span>Data</span><input name="date" type="date" defaultValue={date} /></label>
        <label><span>Local</span><input name="local" defaultValue={local} placeholder="Cidade, bairro, rua..." /></label>
        <label>
          <span>Pagou?</span>
          <select name="paid" defaultValue={paid}>
            <option value="">Todos</option>
            <option value="yes">Sim</option>
            <option value="no">Não</option>
          </select>
        </label>
        <div className="interest-filter-actions">
          <button type="submit" className="form-action-primary">Filtrar</button>
          <Link href={"/sistema/publicidade/solicitacoes?tab=" + tab}>Limpar</Link>
        </div>
      </form>

      <div className="interest-result-count">{filteredRows.length} solicitação(ões) nesta aba</div>

      {filteredRows.length === 0 ? (
        <div className="agenda-empty">Nenhuma solicitação encontrada com estes filtros.</div>
      ) : (
        <div className="interest-list">
          {filteredRows.map((row) => {
            const labels = selectionLabels(row.selections);
            const address = fullAddress(row);
            const finalStatus = row.status === "converted" || row.status === "discarded";
            const isPaid = row.converted_receivable_id ? paidByReceivable.get(row.converted_receivable_id) === true : false;
            const canConvertSubscription =
              row.request_type === "subscription" &&
              row.availability_status === "approved" &&
              !finalStatus;

            return (
              <details key={row.id} className="interest-card">
                <summary className="interest-summary">
                  <span className="interest-date">{formatDate(row.created_at)}</span>
                  <span className="interest-person">
                    <strong>{row.name}</strong>
                    <small>{requestTypeLabel(row.request_type)} · {row.id.slice(0, 8).toUpperCase()}</small>
                  </span>
                  <span className="interest-location">{compactLocation(row)}</span>
                  <span className="interest-badges">
                    <span className={"status-badge " + (row.attended_at ? "interest-badge-done" : "interest-badge-open")}>
                      {row.attended_at ? "Atendida" : "Em aberto"}
                    </span>
                    <span className={"status-badge " + (isPaid ? "interest-badge-paid" : "")}>{isPaid ? "Pago" : "Não pago"}</span>
                  </span>
                </summary>

                <div className="interest-details">
                  <div className="interest-detail-grid">
                    <div>
                      <strong>Contato</strong>
                      <p className="helper-text">
                        <a href={"https://wa.me/" + row.phone.replace(/\D/g, "")} target="_blank" rel="noreferrer">{row.phone}</a>
                        {row.email ? " · " + row.email : ""}
                        {row.company ? " · " + row.company : ""}
                      </p>
                      <strong>Solicitação</strong>
                      <ul>{labels.map((label, index) => <li key={row.id + "-" + index}>{label}</li>)}</ul>
                      <p className="helper-text">
                        Estimativa: {row.estimated_total !== null ? money(Number(row.estimated_total)) : "Sob consulta"}
                        {" · "}Pagamento preferido: {paymentLabel(row.payment_preference)}
                      </p>
                    </div>

                    <div>
                      <strong>Endereço / rota</strong>
                      <p className="helper-text">{address ?? "Não informado"}</p>
                      {row.route_reference ? <p className="helper-text"><b>Referência:</b> {row.route_reference}</p> : null}
                      {row.location_url ? (
                        <p className="helper-text"><a href={row.location_url} target="_blank" rel="noreferrer">Abrir localização no mapa ↗</a></p>
                      ) : null}
                      <p className="helper-text"><b>Rota:</b> {availabilityLabel(row.availability_status)}</p>
                    </div>

                    <div>
                      <strong>Atendimento</strong>
                      <p className="helper-text">Status: {statusLabel(row.status)}</p>
                      {row.attended_at ? <p className="helper-text">Atendida em {formatDate(row.attended_at)}</p> : null}
                      {row.converted_receivable_id ? (
                        <p className="helper-text">
                          Financeiro: <Link href={"/sistema/financeiro/contas-a-receber/" + row.converted_receivable_id}>
                            {isPaid ? "pago" : "pendente"}
                          </Link>
                        </p>
                      ) : null}
                      {row.notes ? <><strong>Observação do cliente</strong><p className="helper-text">{row.notes}</p></> : null}
                      {row.admin_note ? <><strong>Observação interna</strong><p className="helper-text interest-note">{row.admin_note}</p></> : null}
                    </div>
                  </div>

                  {!row.attended_at && !finalStatus ? (
                    <form action={reviewSiteInterestAction.bind(null, row.id)} className="interest-review-form">
                      <label className="form-field">
                        <span className="field-label">Rota/disponibilidade</span>
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
                      <label className="form-field interest-admin-note">
                        <span className="field-label">Observação interna</span>
                        <input name="adminNote" defaultValue={row.admin_note ?? ""} />
                      </label>
                      <button type="submit" className="form-action-primary">Salvar análise</button>
                    </form>
                  ) : null}

                  {!row.attended_at ? (
                    <div className="interest-actions">
                      <a href={whatsappHref(row)} target="_blank" rel="noreferrer" className="button-link">Atender pelo WhatsApp</a>
                      {row.status === "new" ? (
                        <form action={updateSiteInterestStatusAction.bind(null, row.id, "contacted")}><button type="submit">Em atendimento</button></form>
                      ) : null}
                      {canConvertSubscription ? <ConvertSubscriptionInterestButton requestId={row.id} /> : null}
                      {row.request_type === "subscription" && !finalStatus && row.availability_status !== "approved" ? (
                        <span className="helper-text">Aprove a rota antes de converter a assinatura.</span>
                      ) : null}
                      {row.request_type !== "subscription" && !finalStatus ? (
                        <form action={updateSiteInterestStatusAction.bind(null, row.id, "converted")}><button type="submit">Marcar convertida</button></form>
                      ) : null}
                      {!finalStatus ? (
                        <form action={markSiteInterestAttendedAction.bind(null, row.id)}><button type="submit" className="form-action-primary">Marcar atendida</button></form>
                      ) : null}
                      {!finalStatus ? (
                        <form action={updateSiteInterestStatusAction.bind(null, row.id, "discarded")}><button type="submit" className="media-remove-button">Descartar</button></form>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}
