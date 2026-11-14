import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  fiscalRecipient,whatsappComposeUrl,whatsappMessage,
  DELIVERY_STATUS_LABELS,canManuallyResend,
} from "../src/lib/nfse/deliveryPolicy";
import { verifyResendWebhook } from "../src/lib/nfse/verifyResendWebhook";
const src = (path:string)=>readFileSync(new URL(`../src/${path}`,import.meta.url),"utf8");
test("e-mail fiscal prevalece sobre e-mail principal sem duplicar cadastro",()=>{
  assert.equal(fiscalRecipient({fiscalEmail:" fiscal@teste.com.br ",email:"geral@teste.com.br"}),"fiscal@teste.com.br");
  assert.equal(fiscalRecipient({fiscalEmail:"",email:" geral@teste.com.br "}),"geral@teste.com.br");
  assert.equal(fiscalRecipient({fiscalEmail:null,email:null}),null);
  assert.equal(fiscalRecipient({fiscalEmail:"invalido",email:"geral@teste.com.br"}),null);
});
test("WhatsApp abre escolha de contato, sem link publico para XML/PDF",()=>{
  const link=whatsappComposeUrl("123\r\n456");
  assert.ok(link.startsWith("https://wa.me/?text="));
  assert.ok(!link.includes("phone="));
  assert.ok(!link.includes("https%3A%2F%2F"));
  assert.ok(!whatsappMessage("123").includes("http"));
});
test("historico distingue aceito, entregue, aberto e confirmado pelo operador",()=>{
  assert.match(DELIVERY_STATUS_LABELS.accepted,/não confirma recebimento/);
  assert.match(DELIVERY_STATUS_LABELS.delivered,/confirmação do provedor/);
  assert.match(DELIVERY_STATUS_LABELS.opened,/não verificado/);
  assert.match(DELIVERY_STATUS_LABELS.operator_confirmed,/não verificado/);
  assert.equal(canManuallyResend("processing"),false);
  assert.equal(canManuallyResend("uncertain"),true); // com confirmacao humana obrigatoria
});
test("webhook Resend/Svix: somente assinatura valida e janela temporal correta",()=>{
  const now=1794528000;
  const body=JSON.stringify({type:"email.delivered",data:{email_id:"email-test"}});
  const id="msg_123456";
  const ts=String(now);
  const secret="whsec_"+Buffer.from("segredo-de-testes-32-bytes-seguro!").toString("base64");
  const signature="v1,"+createHmac("sha256",Buffer.from(secret.slice(6),"base64"))
    .update(`${id}.${ts}.${body}`).digest("base64");
  const args={rawBody:body,messageId:id,timestamp:ts,signatures:signature,secret,nowSeconds:now};
  assert.equal(verifyResendWebhook(args),true);
  assert.equal(verifyResendWebhook({...args,rawBody:body+" "}),false);
  assert.equal(verifyResendWebhook({...args,nowSeconds:now+3600}),false);
  assert.equal(verifyResendWebhook({...args,signatures:"v1,invalida"}),false);
  assert.equal(verifyResendWebhook({...args,secret:""}),false);
});
test("entrega nunca libera emissão oficial ou e-mail apenas por variável",()=>{
  const worker=src("lib/nfse/deliveryWorker.ts");
  const provider=src("lib/nfse/resendDelivery.ts");
  const api=src("app/api/cron/nfse-delivery/route.ts");
  const confirm=src("app/api/webhooks/nfse-email/route.ts");
  const actions=src("app/sistema/nfse/notas/[id]/delivery-actions.ts");
  assert.match(worker,/NFSE_AVAILABLE_IN_THIS_RELEASE/);
  assert.match(worker,/process\.env\.VERCEL_ENV === "production"/);
  assert.match(worker,/process\.env\.NFSE_DELIVERY_ENABLED === "true"/);
  assert.match(worker,/\.eq\("status","queued"\)/);
  assert.match(worker,/\.eq\("id",row\.id\)\.eq\("status","queued"\)/);
  assert.match(provider,/Idempotency-Key/);
  assert.match(api,/authorization/);
  assert.match(confirm,/handleResendWebhook/);
  assert.match(src("lib/nfse/resendWebhookHandler.ts"),/verifyResendWebhook/);
  assert.match(actions,/is_active_admin_or_owner/);
  assert.match(actions,/origin:"manual",status:"queued"/);
  assert.match(actions,/status:"opened"/);
  assert.match(actions,/operator_confirmed/);
});
test("NFS-e autorizada abre ficha e modal de entrega; consulta mostra horario e destinatario",()=>{
  const action=src("features/nfse/NfseTransmissionPanel.tsx");
  const page=src("app/sistema/nfse/notas/[id]/page.tsx");
  const panel=src("features/nfse/NfseDeliveryPanel.tsx");
  assert.match(action,/\?entrega=1/);
  assert.match(page,/NfseDeliveryPanel/);
  assert.match(panel,/recipientSnapshot/);
  assert.match(panel,/acceptedAt/);
  assert.match(panel,/deliveredAt/);
  assert.match(panel,/confirmedAt/);
  assert.match(panel,/actorName/);
  assert.match(panel,/Marcar como enviado pelo operador/);
});
