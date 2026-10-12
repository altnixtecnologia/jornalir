import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import {
  updateSiteInterestStatusAction,
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
  selections: unknown;
  estimated_total: number | null;
  notes: string | null;
  status: SiteInterestStatus;
  created_at: string;
}

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function requestTypeLabel(value: InterestRow["request_type"]): string {
  if (value === "subscription") return "Assinatura";
  if (value === "advertising") return "Publicidade";
  return "Assinatura + publicidade";
}

function statusLabel(value: SiteInterestStatus): string {
  const labels: Record<SiteInterestStatus, string> = {
    new: "Nova",
    contacted: "Em contato",
    converted: "Convertida",
    discarded: "Descartada",
  };
  return labels[value];
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

export default async function SiteInterestRequestsPage(): Promise<JSX.Element> {
  const client = createSupabaseServerClient();
  const { data, error } = await client
    .from("site_interest_requests")
    .select("id, request_type, name, phone, email, city, company, selections, estimated_total, notes, status, created_at")
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
        description="Interesses enviados pela página Assine. São apenas solicitações para análise — nunca viram venda, assinatura ou Financeiro automaticamente."
      />

      <ul className="quick-access-grid financeiro-kpi-grid">
        <li>
          <div className="quick-access-card" style={{ cursor: "default" }}>
            <span className="quick-access-label">{newCount}</span>
            <span className="quick-access-description">Novas aguardando contato</span>
          </div>
        </li>
        <li>
          <div className="quick-access-card" style={{ cursor: "default" }}>
            <span className="quick-access-label">{rows.length}</span>
            <span className="quick-access-description">Solicitações carregadas</span>
          </div>
        </li>
      </ul>

      <section className="form-section">
        <h2>Fila de atendimento</h2>

        {rows.length === 0 ? (
          <p className="helper-text">Nenhuma solicitação recebida pelo site até agora.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Recebida</th>
                  <th>Contato</th>
                  <th>Interesse</th>
                  <th>Estimativa</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const labels = selectionLabels(row.selections);
                  return (
                    <tr key={row.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{formatDate(row.created_at)}</td>
                      <td>
                        <strong>{row.name}</strong>
                        {row.company ? <><br /><span className="helper-text">{row.company}</span></> : null}
                        <br />
                        <a href={`https://wa.me/${row.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                          {row.phone}
                        </a>
                        {row.city ? <><br /><span className="helper-text">{row.city}</span></> : null}
                        {row.email ? <><br /><span className="helper-text">{row.email}</span></> : null}
                      </td>
                      <td>
                        <strong>{requestTypeLabel(row.request_type)}</strong>
                        {labels.length > 0 ? (
                          <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
                            {labels.map((label, index) => <li key={`${row.id}-${index}`}>{label}</li>)}
                          </ul>
                        ) : null}
                        {row.notes ? <p className="helper-text" style={{ marginTop: "6px" }}>{row.notes}</p> : null}
                      </td>
                      <td>{row.estimated_total !== null ? money(Number(row.estimated_total)) : "Sob consulta"}</td>
                      <td>
                        <span className="status-badge">{statusLabel(row.status)}</span>
                      </td>
                      <td>
                        <div className="form-actions">
                          {row.status !== "contacted" ? (
                            <form action={updateSiteInterestStatusAction.bind(null, row.id, "contacted")}>
                              <button type="submit">Em contato</button>
                            </form>
                          ) : null}
                          {row.status !== "converted" ? (
                            <form action={updateSiteInterestStatusAction.bind(null, row.id, "converted")}>
                              <button type="submit">Convertida</button>
                            </form>
                          ) : null}
                          {row.status !== "discarded" ? (
                            <form action={updateSiteInterestStatusAction.bind(null, row.id, "discarded")}>
                              <button type="submit">Descartar</button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
