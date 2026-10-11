/**
 * Contrato de provedor Pix — NENHUM provedor real foi escolhido/integrado
 * ainda (item 13 da tarefa "Formas de liquidação/Pix/envio ao cliente").
 * Esta abstração existe pra permitir plugar um provedor real depois SEM
 * reescrever PaymentChargeService nem a UI — só trocar qual `PixProvider`
 * a composição injeta.
 *
 * Duas implementações existem hoje:
 *   - createPixProviderPreview(): fixture determinística, só ativa sob
 *     SYSTEM_LOCAL_PREVIEW=1 (o guard fica em quem a instancia, nunca aqui).
 *   - createPixProviderUnavailable(): usada fora do preview enquanto não
 *     houver provedor real configurado — nunca finge sucesso, sempre
 *     recusa com uma mensagem honesta (item 31: "mostrar indisponível de
 *     forma honesta").
 */

export interface CreatePixChargeRequest {
  receivableId: string;
  clientId: string;
  amount: number;
  description?: string;
  /** ISO datetime — opcional; quando ausente, o provedor decide um padrão. */
  expiresAt?: string;
}

export interface PixChargeProviderResult {
  providerChargeId: string;
  pixCopyPaste: string;
  expiresAt?: string;
  status: "pending" | "paid" | "expired" | "cancelled" | "failed";
}

export class PixProviderUnavailableError extends Error {
  constructor() {
    super("Cobrança Pix indisponível: nenhum provedor Pix está configurado neste ambiente.");
  }
}

export interface PixProvider {
  createCharge(request: CreatePixChargeRequest): Promise<PixChargeProviderResult>;
  getCharge(providerChargeId: string): Promise<PixChargeProviderResult>;
  cancelCharge(providerChargeId: string): Promise<void>;
}

/** Sempre recusa — usada fora do preview até um provedor real ser escolhido e configurado. Nunca gera payload fictício fora do preview. */
export function createPixProviderUnavailable(): PixProvider {
  return {
    async createCharge(): Promise<PixChargeProviderResult> {
      throw new PixProviderUnavailableError();
    },
    async getCharge(): Promise<PixChargeProviderResult> {
      throw new PixProviderUnavailableError();
    },
    async cancelCharge(): Promise<void> {
      throw new PixProviderUnavailableError();
    },
  };
}

function demoCopyPaste(amount: number, seed: string): string {
  // Payload de demonstração — formato visualmente parecido com um payload
  // Pix (EMV), mas NUNCA um payload válido/real. Determinístico por seed
  // só pra não mudar a cada render.
  const amountStr = amount.toFixed(2);
  return `00020126580014BR.GOV.BCB.PIX0136preview-demo-${seed}5204000053039865406${amountStr}5802BR5913JORNAL IR DEMO6009SAO PAULO62070503***6304PREV`;
}

/** Adapter de demonstração — só deve ser instanciado quando SYSTEM_LOCAL_PREVIEW=1 (o guard é responsabilidade de quem chama, ver paymentChargeRepository.supabase.ts). Nunca usado fora do preview. */
export function createPixProviderPreview(): PixProvider {
  return {
    async createCharge(request: CreatePixChargeRequest): Promise<PixChargeProviderResult> {
      const seed = `${request.receivableId}-${Date.now()}`;
      return {
        providerChargeId: `preview-pix-${seed}`,
        pixCopyPaste: demoCopyPaste(request.amount, seed),
        expiresAt: request.expiresAt,
        status: "pending",
      };
    },
    async getCharge(providerChargeId: string): Promise<PixChargeProviderResult> {
      return { providerChargeId, pixCopyPaste: demoCopyPaste(0, providerChargeId), status: "pending" };
    },
    async cancelCharge(): Promise<void> {
      // No-op — o cancelamento de verdade é só o status da linha em payment_charges.
    },
  };
}
