import test from "node:test";
import assert from "node:assert/strict";
import {
 validateCommercialSaleForBilling,validateChargeReceivableLink,inspectExistingCommercialInstallment,
} from "../src/lib/financeiro/commercialSaleBillingGuard";
import type {CommercialSale} from "@ir/types";

const sale:Pick<CommercialSale,"status"|"commercialCondition"|"amount"|"installmentsCount">={
 status:"approved",commercialCondition:"installments",amount:100,installmentsCount:3,
};
test("vendas aprovadas, ativas e concluídas podem gerar parcelas válidas",()=>{
 for(const status of ["approved","active","completed"] as const){
  assert.equal(validateCommercialSaleForBilling({...sale,status},"2026-11-30"),null);
 }
});
test("não criar Financeiro para proposta, venda cancelada ou cortesia",()=>{
 for(const status of ["proposal","cancelled"] as const)
  assert.match(validateCommercialSaleForBilling({...sale,status},"2026-11-30")??"",/não geram cobrança/);
 assert.match(validateCommercialSaleForBilling({...sale,commercialCondition:"courtesy"},"2026-11-30")??"",/cortesia/);
});
test("permuta, comodato e outras condições não geram boleto/Pix por engano",()=>{
 for(const condition of ["trade","bailment","other"] as const){
  const error=validateCommercialSaleForBilling({...sale,commercialCondition:condition},"2026-11-30");
  assert.match(error??"",/não geram cobrança automaticamente/);
 }
 assert.equal(validateCommercialSaleForBilling({...sale,commercialCondition:"cash",installmentsCount:1},"2026-11-30"),null);
 assert.equal(validateCommercialSaleForBilling({...sale,commercialCondition:"installments"},"2026-11-30"),null);
});

test("zero, valor menor que o número de parcelas e quantidades inválidas são rejeitados",()=>{
 for(const values of [
  {amount:0},{amount:-1},{amount:Number.NaN},{amount:0.02,installmentsCount:3},
  {installmentsCount:0},{installmentsCount:1.5},{installmentsCount:1000},
 ]) assert.ok(validateCommercialSaleForBilling({...sale,...values},"2026-11-30"));
});
test("datas inexistentes são bloqueadas antes da escrita no banco",()=>{
 for(const date of ["2026-02-30","2026-11-31","2026-2-3","garbage",""])
  assert.ok(validateCommercialSaleForBilling(sale,date),date);
 assert.equal(validateCommercialSaleForBilling(sale,"2028-02-29"),null);
});
test("cancelar/confirmar uma cobrança de outro título ou cliente é proibido",()=>{
 const rec={id:"titulo-1",clientId:"cliente-1"};
 const charge={receivableId:"titulo-1",clientId:"cliente-1"};
 assert.equal(validateChargeReceivableLink(charge,rec),null);
 assert.ok(validateChargeReceivableLink({...charge,receivableId:"titulo-2"},rec));
 assert.ok(validateChargeReceivableLink({...charge,clientId:"cliente-2"},rec));
});

test("parcela existente com valores idênticos é reconhecida sem nova emissão",()=>{
 const draft={installmentNumber:2,amount:33.33,dueDate:"2026-12-15"};
 const existing={...draft,originalAmount:draft.amount,status:"open",clientId:"cliente-1"};
 assert.deepEqual(inspectExistingCommercialInstallment(draft,existing,"cliente-1"),{alreadyGenerated:true});
});
test("não substituir parcela já paga, cancelada ou com outro vencimento",()=>{
 const draft={installmentNumber:1,amount:200,dueDate:"2026-12-15"};
 const existing={...draft,originalAmount:200,status:"cancelled",clientId:"cliente-1"};
 assert.match(inspectExistingCommercialInstallment(draft,existing,"cliente-1").error??"",/cancelada/);
 assert.match(inspectExistingCommercialInstallment(draft,{...existing,status:"paid",dueDate:"2027-01-15"},"cliente-1").error??"",/valor ou vencimento/);
 assert.match(inspectExistingCommercialInstallment(draft,{...existing,status:"paid",originalAmount:100},"cliente-1").error??"",/valor ou vencimento/);
 assert.match(inspectExistingCommercialInstallment(draft,{...existing,status:"paid",clientId:"outra"},"cliente-1").error??"",/outra negociação/);
});

test("vencimento não pode anteceder emissão em São Paulo",()=>{
 assert.equal(validateCommercialSaleForBilling(sale,"2026-10-24","2026-10-24"),null);
 assert.match(validateCommercialSaleForBilling(sale,"2026-10-23","2026-10-24")??"",/anterior à data de emissão/);
});
