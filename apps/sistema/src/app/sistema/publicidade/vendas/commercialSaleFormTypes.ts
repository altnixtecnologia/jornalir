import type { CommercialCondition } from "@ir/types";

export interface CommercialSaleFormInput {
  clientId: string;
  productId: string;
  channel: string;
  description: string;
  startDate: string;
  endDate: string;
  amount: string;
  commercialCondition: CommercialCondition;
  installmentsCount: string;
  notes: string;
}

export function toCommercialSaleServiceInput(input: CommercialSaleFormInput) {
  return {
    clientId: input.clientId,
    productId: input.productId || undefined,
    channel: input.channel,
    description: input.description,
    startDate: input.startDate,
    endDate: input.endDate || undefined,
    amount: Number(input.amount),
    commercialCondition: input.commercialCondition,
    installmentsCount: input.commercialCondition === "installments" ? Number(input.installmentsCount || "1") : 1,
    notes: input.notes || undefined,
  };
}
