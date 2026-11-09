import test from "node:test";
import assert from "node:assert/strict";
import {coverageNotification,currentCoverageNotification} from "../src/lib/notifications/coverageReminderPolicy";
const id="11111111-1111-4111-8111-111111111111";
const owner="22222222-2222-4222-8222-222222222222";
const event={id,title:"Rodeio",event_date:"2026-11-20",start_time:"18:00",status:"scheduled"};
const cov={event_id:id,attendance_owner_id:owner,attendance_status:"pending",audible_minutes:60,checkin_minutes:5,article_status:"pending",revision:1};
test("1 hora antes gera lembrete individual do titular e não dispara atrasado",()=>{
 const n=coverageNotification(event,cov,"reminder","2026-11-20T17:00","2026-11-20T20:00:00.000Z");
 assert.ok(n);
 assert.equal(n.target_profile_id,owner);
 assert.equal(n.dedupe_key,"coverage:reminder:"+id+":2026-11-20T17:00:"+owner+":1");
 assert.equal(coverageNotification(event,cov,"reminder","2026-11-20T17:11","2026-11-20T20:11:00Z"),null);
});
test("5 minutos antes é silencioso; presença confirmada cancela aviso",()=>{
 const n=coverageNotification(event,cov,"checkin","2026-11-20T17:55","2026-11-20T20:55:00Z");
 assert.ok(n);
 assert.equal(currentCoverageNotification(n.dedupe_key,owner,event,cov,"2026-11-20T17:56")?.silent,true);
 assert.equal(currentCoverageNotification(n.dedupe_key,owner,event,{...cov,attendance_status:"present"},"2026-11-20T17:56"),null);
});
test("aceite de transferência invalida notificações antigas",()=>{
 const n=coverageNotification(event,cov,"reminder","2026-11-20T17:00","2026-11-20T20:00:00Z");
 assert.ok(n);
 assert.equal(currentCoverageNotification(n.dedupe_key,owner,event,{...cov,revision:2},"2026-11-20T17:00"),null);
 assert.equal(currentCoverageNotification(n.dedupe_key,owner,event,{...cov,attendance_owner_id:id},"2026-11-20T17:00"),null);
});
