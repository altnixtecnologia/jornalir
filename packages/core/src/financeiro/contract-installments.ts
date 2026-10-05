import { addPeriodicityInterval, type InstitutionalContract } from "@ir/types";
import type { ReceivableInput } from "./receivable-service";

/**
 * Parcelas/competências de contrato (Parte 3B, item 7) — ferramenta de
 * conveniência, nunca presume que todo contrato é parcelado igualmente.
 * Puro/sem banco: só monta a prévia; cada item pode ser ajustado
 * individualmente (valor/competência/vencimento/descrição) antes da
 * aplicação chamar ReceivableService.register() item a item.
 */

export interface InstallmentDraft {
  index: number;
  competencyDate: string;
  dueDate: string;
  input: ReceivableInput;
}

export interface GenerateInstallmentsOptions {
  count: number;
  firstCompetencyDate: string;
  firstDueDate: string;
  /** Valor de cada parcela — se omitido, divide totalAmount igualmente (último ajustado pra fechar a soma exata). */
  amountPerInstallment?: number;
  /** Usado só quando amountPerInstallment não é informado (divisão automática). */
  totalAmount?: number;
  descriptionPrefix?: string;
}

export function generateContractInstallments(contract: InstitutionalContract, options: GenerateInstallmentsOptions): InstallmentDraft[] {
  const count = Math.max(1, Math.floor(options.count));
  const prefix = options.descriptionPrefix?.trim() || `Contrato ${contract.reference}`;

  let amounts: number[];
  if (options.amountPerInstallment !== undefined) {
    amounts = Array.from({ length: count }, () => options.amountPerInstallment as number);
  } else {
    const total = options.totalAmount ?? 0;
    const base = Math.floor((total / count) * 100) / 100;
    amounts = Array.from({ length: count }, () => base);
    const roundedTotal = base * count;
    const remainder = Math.round((total - roundedTotal) * 100) / 100;
    if (remainder !== 0) amounts[amounts.length - 1] = Math.round((amounts[amounts.length - 1] + remainder) * 100) / 100;
  }

  const drafts: InstallmentDraft[] = [];
  for (let index = 0; index < count; index += 1) {
    const competencyDate = index === 0 ? options.firstCompetencyDate : addPeriodicityInterval(options.firstCompetencyDate, "monthly", index);
    const dueDate = index === 0 ? options.firstDueDate : addPeriodicityInterval(options.firstDueDate, "monthly", index);
    drafts.push({
      index: index + 1,
      competencyDate,
      dueDate,
      input: {
        clientId: contract.clientId,
        description: `${prefix} — parcela ${index + 1}/${count} (competência ${competencyDate.slice(0, 7)})`,
        sourceType: "institutional_contract",
        sourceReference: `Contrato ${contract.reference}`,
        contractId: contract.id,
        originalAmount: amounts[index],
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate,
        competencyDate,
      },
    });
  }
  return drafts;
}
