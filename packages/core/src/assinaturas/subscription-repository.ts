import type { Subscription } from "@ir/types";

/** Id, reference, createdAt e updatedAt são atribuídos pelo provider. */
export type NewSubscriptionRecord = Omit<Subscription, "id" | "reference" | "createdAt" | "updatedAt">;

export type SubscriptionChanges = Partial<NewSubscriptionRecord>;

export class SubscriptionValidationError extends Error {}

export interface SubscriptionListQuery {
  clientId?: string;
}

export interface SubscriptionRepository {
  list(query?: SubscriptionListQuery): Promise<Subscription[]>;
  getById(id: string): Promise<Subscription | null>;
  create(record: NewSubscriptionRecord): Promise<Subscription>;
  update(id: string, changes: SubscriptionChanges): Promise<Subscription>;
}
