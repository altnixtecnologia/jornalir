import type { BillingMessageLog, Receivable, ReceivableSourceType } from "@ir/types";

export type NewBillingMessageLogRecord = Omit<BillingMessageLog, "id" | "createdAt">;

export interface BillingMessageRepository {
  listForReceivable(receivableId: string): Promise<BillingMessageLog[]>;
  create(record: NewBillingMessageLogRecord): Promise<BillingMessageLog>;
}

/** "referente à sua assinatura"/"à publicidade"/"ao contrato"/"ao lançamento" — sempre a partir de source_type real, nunca inventado (item 18 da tarefa). */
const SOURCE_PHRASES: Record<ReceivableSourceType, string> = {
  subscription: "sua assinatura do Jornal Informativo Regional",
  advertising: "sua publicidade no Jornal Informativo Regional",
  institutional_contract: "o contrato institucional com o Jornal Informativo Regional",
  miscellaneous: "o lançamento abaixo",
  other: "a cobrança abaixo",
};

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

export interface BuildBillingMessageInput {
  clientFirstName: string;
  receivable: Pick<Receivable, "sourceType" | "description" | "dueDate">;
  amount: number;
  pixCopyPaste?: string;
}

/**
 * Compõe a mensagem conceitual de cobrança — pura, sem template engine
 * (nenhum mecanismo de templates existia no projeto antes desta tarefa;
 * se um for criado depois, troca esta função, não a chamada). A origem
 * vem sempre de `receivable.sourceType` — nunca um texto inventado.
 */
export function buildBillingMessage(input: BuildBillingMessageInput): string {
  const sourcePhrase = SOURCE_PHRASES[input.receivable.sourceType];
  const lines = [
    `Olá, ${input.clientFirstName}.`,
    "",
    `Segue a cobrança referente a ${sourcePhrase}, no valor de ${formatAmount(input.amount)}, com vencimento em ${formatDate(input.receivable.dueDate)}.`,
  ];
  if (input.receivable.description) lines.push("", input.receivable.description);
  if (input.pixCopyPaste) lines.push("", "Pix Copia e Cola:", input.pixCopyPaste);
  return lines.join("\n");
}

export class ClientWithoutWhatsappError extends Error {
  constructor() {
    super("Cadastro sem WhatsApp.");
  }
}

export interface SendBillingMessageInput {
  receivableId: string;
  clientId: string;
  toPhone?: string;
  message: string;
  createdByProfileId?: string;
}

/**
 * Envio de cobrança ao cliente — arquitetura preparada, NENHUMA chamada
 * real ao WhatsApp Cloud API nesta fase (ver supabase/functions/
 * enviar-cobranca-whatsapp e o relatório da tarefa). `sender` é injetado
 * pela composição: em preview, uma função que só "simula"; fora do
 * preview, sem provedor configurado, lança ClientWithoutWhatsappError (se
 * não houver telefone) ou recusa o envio de forma honesta.
 */
export class BillingMessageService {
  constructor(
    private readonly logs: BillingMessageRepository,
    private readonly sender: (input: { toPhone: string; message: string }) => Promise<{ status: "sent" | "simulated"; providerMessageId?: string }>,
  ) {}

  async send(input: SendBillingMessageInput): Promise<BillingMessageLog> {
    if (!input.toPhone) throw new ClientWithoutWhatsappError();
    try {
      const result = await this.sender({ toPhone: input.toPhone, message: input.message });
      return this.logs.create({
        receivableId: input.receivableId,
        clientId: input.clientId,
        channel: "whatsapp",
        toPhone: input.toPhone,
        message: input.message,
        status: result.status,
        providerMessageId: result.providerMessageId,
        createdByProfileId: input.createdByProfileId,
      });
    } catch (error) {
      await this.logs.create({
        receivableId: input.receivableId,
        clientId: input.clientId,
        channel: "whatsapp",
        toPhone: input.toPhone,
        message: input.message,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Falha desconhecida ao enviar.",
        createdByProfileId: input.createdByProfileId,
      });
      throw error;
    }
  }

  listForReceivable(receivableId: string): Promise<BillingMessageLog[]> {
    return this.logs.listForReceivable(receivableId);
  }
}

/** Fora do preview, sem provedor WhatsApp configurado — nunca finge sucesso (item 31). */
export class WhatsappProviderUnavailableError extends Error {
  constructor() {
    super("Envio por WhatsApp indisponível: nenhum provedor está configurado neste ambiente.");
  }
}

export function createWhatsappSenderUnavailable(): (input: { toPhone: string; message: string }) => Promise<{ status: "sent" | "simulated" }> {
  return async () => {
    throw new WhatsappProviderUnavailableError();
  };
}

/** Só deve ser usado quando SYSTEM_LOCAL_PREVIEW=1 (guard é responsabilidade de quem instancia). Nunca chama nenhuma API. */
export function createWhatsappSenderPreview(): (input: { toPhone: string; message: string }) => Promise<{ status: "sent" | "simulated" }> {
  return async () => ({ status: "simulated" });
}
