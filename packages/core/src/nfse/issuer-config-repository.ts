import type { NfseIssuerConfig } from "@ir/types";

export type NewIssuerConfigRecord = Omit<NfseIssuerConfig, "id" | "createdByProfileId" | "updatedByProfileId" | "createdAt" | "updatedAt">;
export type IssuerConfigChanges = Partial<NewIssuerConfigRecord>;

export class IssuerConfigValidationError extends Error {}

export interface IssuerConfigRepository {
  /** Sempre a configuração mais recente — este módulo trabalha com uma única configuração ativa por vez (nunca múltiplas configurações concorrentes). */
  getCurrent(): Promise<NfseIssuerConfig | null>;
  create(record: NewIssuerConfigRecord): Promise<NfseIssuerConfig>;
  update(id: string, changes: IssuerConfigChanges): Promise<NfseIssuerConfig>;
}
