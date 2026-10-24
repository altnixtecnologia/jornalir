import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAgendaInvitationNotification,
  agendaInvitationStillPending,
} from "../src/lib/notifications/agendaInvitationPolicy";

const now = "2026-10-24T18:50:00.000Z";
const local = "2026-10-24T15:50";
const invite = {
  event_id: "11111111-1111-4111-8111-111111111111",
  profile_id: "22222222-2222-4222-8222-222222222222",
  invited_at: "2026-10-24T18:45:00Z",
  status: "pending",
};
const meeting = {
  id: invite.event_id, title: "Reunião de pauta",
  event_date: "2026-10-25", start_time: "09:30:00",
  status: "scheduled", event_kind: "general",
};
test("convite individual gera evento privado, com chave estável e link correto", () => {
  const result = buildAgendaInvitationNotification(invite, meeting, now, local);
  assert.equal(result?.kind, "agenda");
  assert.equal(result?.target_profile_id, invite.profile_id);
  assert.equal(result?.href, "/sistema/agenda?date=2026-10-25");
  assert.equal(result?.scheduled_at, now);
  assert.match(result?.body || "", /aceitar ou recusar/);
  assert.deepEqual(result, buildAgendaInvitationNotification(invite, meeting, now, local));
});
test("não notificar convidados que já responderam ou reunião cancelada/editorial", () => {
  assert.equal(buildAgendaInvitationNotification({...invite,status:"accepted"},meeting,now,local),null);
  assert.equal(buildAgendaInvitationNotification({...invite,status:"declined"},meeting,now,local),null);
  assert.equal(buildAgendaInvitationNotification(invite,{...meeting,status:"cancelled"},now,local),null);
  assert.equal(buildAgendaInvitationNotification(invite,{...meeting,event_kind:"editorial"},now,local),null);
});
test("não reenviar convites antigos nem gerar alerta para reunião encerrada", () => {
  assert.equal(buildAgendaInvitationNotification({...invite,invited_at:"2026-10-20T10:00:00Z"},meeting,now,local),null);
  assert.equal(buildAgendaInvitationNotification(invite,{...meeting,event_date:"2026-10-24",start_time:"15:00:00"},now,local),null);
  assert.equal(buildAgendaInvitationNotification(invite,{...meeting,event_date:"2026-10-23"},now,local),null);
});
test("revalidação do envio falha fechada para resposta, mudança de convite ou reunião", () => {
  const key=buildAgendaInvitationNotification(invite,meeting,now,local)!.dedupe_key;
  assert.equal(agendaInvitationStillPending(key,invite.profile_id,{status:"pending",invited_at:invite.invited_at},meeting),true);
  assert.equal(agendaInvitationStillPending(key,invite.profile_id,{status:"accepted",invited_at:invite.invited_at},meeting),false);
  assert.equal(agendaInvitationStillPending(key,invite.profile_id,{status:"pending",invited_at:"2026-10-24T18:49:00Z"},meeting),false);
  assert.equal(agendaInvitationStillPending(key,invite.event_id,{status:"pending",invited_at:invite.invited_at},meeting),false);
  assert.equal(agendaInvitationStillPending(key,invite.profile_id,{status:"pending",invited_at:invite.invited_at},{...meeting,status:"cancelled"}),false);
});
