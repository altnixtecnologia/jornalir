// Edge Function STUB — NÃO IMPLANTADA (nunca rodou `supabase functions
// deploy`), NÃO chama nenhuma API real. Arquitetura equivalente à já
// usada no Altnix Informativo (Edge Function "enviar-whatsapp" + WhatsApp
// Cloud API/Graph API), preparada agora pra quando um provedor WhatsApp
// for configurado pro Jornal IR — ver relatório da tarefa "Formas de
// liquidação/Pix/envio ao cliente".
//
// NENHUM token/secret está presente neste arquivo. As env vars abaixo
// precisam ser configuradas como Secrets da função (nunca committadas)
// quando esta função for de fato implantada:
//
//   WHATSAPP_ACCESS_TOKEN     — token de acesso da WhatsApp Cloud API (Meta/Graph API)
//   WHATSAPP_PHONE_NUMBER_ID  — id do número de telefone comercial configurado na Meta
//   WHATSAPP_API_VERSION      — ex.: "v20.0" (versão da Graph API)
//
// Contrato de entrada esperado (JSON no corpo da requisição):
//   { receivableId: string; toPhone: string; message: string }
//
// Contrato de saída esperado:
//   { ok: true; providerMessageId: string } | { ok: false; error: string }
//
// Esta função NUNCA deve ser chamada a partir do app sem que as env vars
// acima estejam configuradas — enquanto isso, o app usa
// createWhatsappSenderUnavailable() (ver packages/core/src/financeiro/
// billing-message.ts), que recusa o envio de forma honesta em vez de
// fingir sucesso (item 31 da tarefa).

interface SendWhatsappRequest {
  receivableId: string;
  toPhone: string;
  message: string;
}

// @ts-expect-error — Deno global só existe no runtime da Edge Function (não no build do Next.js); isto NUNCA é importado pelo app.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405 });
  }

  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!accessToken || !phoneNumberId) {
    return new Response(
      JSON.stringify({ ok: false, error: "WhatsApp não configurado (WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID ausentes)." }),
      { status: 503 },
    );
  }

  let body: SendWhatsappRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Corpo da requisição inválido." }), { status: 400 });
  }
  if (!body.toPhone || !body.message) {
    return new Response(JSON.stringify({ ok: false, error: "toPhone e message são obrigatórios." }), { status: 400 });
  }

  // TODO (quando um provedor WhatsApp real for escolhido/configurado):
  // chamar a Graph API (https://graph.facebook.com/{version}/{phoneNumberId}/messages)
  // com o accessToken acima, enviando uma mensagem de texto pra body.toPhone.
  // NÃO IMPLEMENTADO NESTA FASE — esta função nunca foi implantada nem chamada.
  return new Response(JSON.stringify({ ok: false, error: "Envio real ainda não implementado." }), { status: 501 });
});
