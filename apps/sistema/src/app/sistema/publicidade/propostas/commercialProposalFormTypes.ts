import type { CommercialCondition } from "@ir/types";

export interface CommercialProposalItemFormInput {
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
}

export interface CommercialProposalFormInput {
  clientId: string;
  proposalDate: string;
  validUntil: string;
  commercialCondition: CommercialCondition;
  notes: string;
  internalNotes: string;
  items: CommercialProposalItemFormInput[];
}

export function toCommercialProposalServiceInput(input: CommercialProposalFormInput) {
  return {
    clientId: input.clientId,
    proposalDate: input.proposalDate,
    validUntil: input.validUntil || undefined,
    commercialCondition: input.commercialCondition,
    notes: input.notes || undefined,
    internalNotes: input.internalNotes || undefined,
    items: input.items.map((item) => ({
      productId: item.productId || undefined,
      description: item.description,
      quantity: Number(item.quantity || "0"),
      unitPrice: Number(item.unitPrice || "0"),
      discountAmount: Number(item.discountAmount || "0"),
    })),
  };
}
