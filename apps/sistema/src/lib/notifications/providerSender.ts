import "server-only";
import { sendWhatsappNamedTemplate } from "../financeiro/whatsappCloudProvider";
import type { Sender } from "./notificationDispatcher";
import { WhatsappProviderError } from "./whatsappErrors";

/** Envio de template aprovado pelo nome; resposta sem ID da Meta é tratada como resultado ambíguo. */
export const whatsappSender: Sender = async (template, toE164, params) => {
  const sent = await sendWhatsappNamedTemplate(toE164, template, params);
  if (!sent.providerMessageId) throw new WhatsappProviderError("Sem identificador da Meta.", "ambiguous");
  return { providerMessageId: sent.providerMessageId };
};
