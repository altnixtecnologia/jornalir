import type {CommercialSale} from "@ir/types";

/** Valida a VENDA antes de inserir qualquer título; a constraint do banco
 * continua sendo o controle definitivo contra parcelas duplicadas.
 * Distinguir erro de cobrança inválida de erro de pagamento confirmado.
 */
export function validateCommercialSaleForBilling(
 sale:Pick<CommercialSale,"status"|"commercialCondition"|"amount"|"installmentsCount">,
 firstDueDate:string,issueDate?:string,
):string|null {
 if(sale.status==="proposal"||sale.status==="cancelled")
  return "Somente vendas aprovadas, ativas ou concluídas podem gerar títulos. Propostas e vendas canceladas não geram cobrança.";
 if(sale.commercialCondition==="courtesy")
  return "Negociação em cortesia não gera títulos nem cobrança Pix.";
 if(!Number.isFinite(sale.amount)||sale.amount<=0)
  return "Venda sem valor financeiro positivo. Revise a condição comercial antes de gerar cobranças.";
 if(!Number.isSafeInteger(sale.installmentsCount)||sale.installmentsCount<1
   ||sale.installmentsCount>120)
  return "Número de parcelas inválido; revise a venda.";
 if(Math.round(sale.amount*100)<sale.installmentsCount)
  return "Valor insuficiente: alguma parcela ficaria abaixo de R$ 0,01.";
 if(!/^\d{4}-\d{2}-\d{2}$/.test(firstDueDate))
  return "Selecione uma data de vencimento válida para a primeira parcela.";
 const [year,month,day]=firstDueDate.split("-").map(Number);
 const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)
  return "Vencimento da primeira parcela é uma data inexistente.";
 if(issueDate && firstDueDate<issueDate)
  return "O vencimento da primeira parcela não pode ser anterior à data de emissão do título.";
 return null;
}

/** Usado no servidor: a cobrança informada deve pertencer ao título da URL
 * antes de CANCELAR no Asaas. Nunca confiar só no receivableId do cliente.
 */
export function validateChargeReceivableLink(
 charge:{receivableId:string;clientId:string},
 receivable:{id:string;clientId:string},
):string|null {
 if(charge.receivableId!==receivable.id || charge.clientId!==receivable.clientId)
  return "A cobrança Pix não pertence ao título e cliente selecionados.";
 return null;
}

/** Evita gerar uma segunda parcela para o mesmo histórico (inclusive
 * quando o título anterior foi cancelado). Reutilizar somente dados
 * iguais aos originalmente gerados; não alterar valor ou vencimento.
 */
export function inspectExistingCommercialInstallment(
 draft:{amount:number;dueDate:string;installmentNumber:number},
 existing:{status:string;originalAmount:number;dueDate:string;installmentNumber?:number;clientId:string},
 saleClientId:string,
):{alreadyGenerated:boolean;error?:string} {
 if(existing.status==="cancelled") return {alreadyGenerated:false,
  error:`Parcela ${draft.installmentNumber} cancelada anteriormente. Reabra o título no Financeiro ou revise a negociação; não crie uma duplicata.`};
 if(existing.clientId!==saleClientId||existing.installmentNumber!==draft.installmentNumber)
  return {alreadyGenerated:false,error:"Parcela existente pertence a outra negociação. Conciliação necessária."};
 if(Math.round(existing.originalAmount*100)!==Math.round(draft.amount*100)
   ||existing.dueDate!==draft.dueDate)
  return {alreadyGenerated:false,error:`Parcela ${draft.installmentNumber} já foi emitida com valor ou vencimento diferente. Preserve-a e ajuste a venda pelo Financeiro.`};
 return {alreadyGenerated:true};
}
