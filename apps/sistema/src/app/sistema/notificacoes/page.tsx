import Link from "next/link";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { loadMyPendingMeetingInvitations } from "../../../features/agenda/agendaData";
import type { PendingMeetingInvitation } from "../../../features/agenda/agendaTypes";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "./actions";

export const dynamic = "force-dynamic";

function dateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

export default async function NotificationsPage(): Promise<JSX.Element> {
  const client = createSupabaseServerClient();

  const [{ data: notifications, error: notificationError }, { data: requests, error: requestError }] =
    await Promise.all([
      client
        .from("admin_notifications")
        .select("id, kind, title, message, href, created_at, read_at")
        .order("created_at", { ascending: false })
        .limit(100),
      client
        .from("site_interest_requests")
        .select("id, name, request_type, created_at")
        .is("attended_at", null)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  const auth = await client.auth.getUser();
  let invitations: PendingMeetingInvitation[] = [];
  let invitationError: string | null = null;
  if (auth.data.user?.id) {
    try {
      invitations = await loadMyPendingMeetingInvitations(client, auth.data.user.id);
    } catch (error) {
      invitationError = error instanceof Error ? error.message : "Falha ao consultar convites.";
    }
  }

  // Uma falha de leitura não deve derrubar toda a página de notificações.
  // Mantenha as seções independentes e mostre o problema para diagnóstico.

  const unread = (notifications ?? []).filter((item) => !item.read_at).length;

  return (
    <>
      <ModuleHeader
        eyebrow="SISTEMA / NOTIFICAÇÕES"
        title="Notificações"
        description="Convites da Agenda, pagamentos, alertas financeiros e solicitações do site."
      />

      {notificationError || requestError || invitationError ? (
        <div role="alert" className="inline-form" style={{ marginBottom: 16 }}>
          <strong>Não foi possível carregar todos os avisos.</strong>
          {notificationError ? <p>Eventos do sistema: {notificationError.message}</p> : null}
          {requestError ? <p>Solicitações do site: {requestError.message}</p> : null}
          {invitationError ? <p>Convites da Agenda: {invitationError}</p> : null}
          <p className="helper-text">Atualize a página para tentar novamente. Nenhum registro foi alterado.</p>
        </div>
      ) : null}

      <div className="materias-toolbar">
        <span className="materias-count">
          {unread} notificação(ões) não lida(s) · {requests?.length ?? 0} solicitação(ões) nova(s) · {invitations.length} convite(s) pendente(s)
        </span>
        {unread > 0 ? (
          <form action={markAllNotificationsReadAction}>
            <button type="submit" className="header-action">Marcar todas como lidas</button>
          </form>
        ) : null}
      </div>

      {invitations.length > 0 ? (
        <section className="inline-form" style={{ marginBottom: 18 }}>
          <h2 style={{ marginTop: 0 }}>Convites de reuniões aguardando resposta</h2>
          <p className="helper-text">Somente seus convites. Abra a Agenda para aceitar ou recusar.</p>
          <div style={{ display: "grid", gap: 8 }}>
            {invitations.map((invitation) => (
              <Link key={invitation.eventId}
                href={"/agenda?date=" + encodeURIComponent(invitation.eventDate)}
                style={{ display: "block", border: "1px solid var(--line)", borderRadius: 8,
                  padding: 12, textDecoration: "none", color: "inherit" }}>
                <strong>{invitation.title}</strong>
                <div className="helper-text">
                  {invitation.eventDate.split("-").reverse().join("/")}
                  {invitation.startTime ? " · " + invitation.startTime + "h" : ""}
                  {invitation.location ? " · " + invitation.location : ""}
                  {" · Abrir para responder"}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {(requests?.length ?? 0) > 0 ? (
        <section className="inline-form" style={{ marginBottom: 18 }}>
          <h2 style={{ marginTop: 0 }}>Solicitações novas do site</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {(requests ?? []).map((request) => (
              <Link
                key={request.id}
                href="/sistema/publicidade/solicitacoes"
                style={{
                  display: "block",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: 12,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <strong>{request.name}</strong>
                <div className="helper-text">
                  {request.id.slice(0, 8).toUpperCase()} · {request.request_type} · {dateTime(request.created_at)}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2>Eventos do sistema</h2>
        {(notifications?.length ?? 0) === 0 ? (
          <p className="helper-text">Nenhuma notificação registrada.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {(notifications ?? []).map((notification) => (
              <article
                key={notification.id}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: 14,
                  background: notification.read_at ? "var(--surface, #fff)" : "rgba(201,48,48,.04)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <strong>{notification.title}</strong>
                    <p style={{ margin: "5px 0 0" }}>{notification.message}</p>
                    <p className="helper-text" style={{ marginBottom: 0 }}>{dateTime(notification.created_at)}</p>
                  </div>
                  <div className="candidate-row-actions">
                    {notification.href ? (
                      <Link href={notification.href}>Abrir</Link>
                    ) : null}
                    {!notification.read_at ? (
                      <form action={markNotificationReadAction.bind(null, notification.id)}>
                        <button type="submit">Marcar como lida</button>
                      </form>
                    ) : (
                      <span className="helper-text">Lida</span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
