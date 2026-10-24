import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAgendaInvitationNotification,
  agendaInvitationStillPending,
  agendaReminderRecipients,
  currentAgendaReminderPush,
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

test("lembrete reúne responsáveis e convidados que aceitaram sem duplicar destinatário", () => {
  const recipients = agendaReminderRecipients(
    [{ profile_id: "responsavel", completed_at: null },
     { profile_id: "mesma-pessoa", completed_at: null }],
    [{ profile_id: "mesma-pessoa" }, { profile_id: "convidado" },
     { profile_id: "convidado" }],
  );
  assert.deepEqual(recipients, [
    { profile_id: "responsavel", completed_at: null, meetingOnly: false },
    { profile_id: "mesma-pessoa", completed_at: null, meetingOnly: false },
    { profile_id: "convidado", completed_at: null, meetingOnly: true },
  ]);
});

const baseReminder = {
  title: "Reunião da redação",
  event_date: "2026-10-25",
  start_time: "10:00:00",
  end_time: "11:00:00",
  reminder_minutes: 30,
  status: "scheduled",
  event_kind: "general",
};
const recipient = "33333333-3333-4333-8333-333333333333";
const reminderKey = "agenda:reminder:11111111-1111-4111-8111-111111111111:2026-10-25T09:30:" + recipient;
const overdueKey = "agenda:overdue:11111111-1111-4111-8111-111111111111:2026-10-25T11:10:" + recipient;

test("lembrete é entregue ao convidado aceito, nunca cria alerta de atraso ao convidado", () => {
  const reminder = currentAgendaReminderPush(reminderKey, recipient, baseReminder, null, "accepted", "2026-10-25T09:31");
  assert.match(reminder?.title || "", /Reunião da redação/);
  assert.equal(currentAgendaReminderPush(reminderKey, recipient, baseReminder, null, "declined", "2026-10-25T09:31"), null);
  assert.equal(currentAgendaReminderPush(overdueKey, recipient, baseReminder, null, "accepted", "2026-10-25T11:11"), null);
});

test("lembrete obsoleto é bloqueado após edição, cancelamento ou conclusão", () => {
  const active = { completed_at: null };
  assert.equal(currentAgendaReminderPush(reminderKey, recipient, {...baseReminder,status:"cancelled"}, active, null,"2026-10-25T09:31"),null);
  assert.equal(currentAgendaReminderPush(reminderKey, recipient, {...baseReminder,start_time:"12:00:00"}, active, null,"2026-10-25T09:31"),null);
  assert.equal(currentAgendaReminderPush(reminderKey, recipient, baseReminder,{completed_at:"2026-10-25T08:00:00Z"},null,"2026-10-25T09:31"),null);
  assert.equal(currentAgendaReminderPush(reminderKey, recipient, baseReminder,active,null,"2026-10-25T09:41"),null);
  assert.equal(currentAgendaReminderPush(reminderKey, invite.profile_id, baseReminder,active,null,"2026-10-25T09:31"),null);
  assert.equal(currentAgendaReminderPush(reminderKey, recipient, {...baseReminder,title:"Novo título"},active,null,"2026-10-25T09:31")?.title,"📅 Novo título");
  assert.match(currentAgendaReminderPush(overdueKey, recipient, baseReminder,active,null,"2026-10-25T11:11")?.title || "",/atrasado/);
});
