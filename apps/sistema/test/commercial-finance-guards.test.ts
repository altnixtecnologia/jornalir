import test from "node:test";
import assert from "node:assert/strict";
import {
 validateCommercialSaleForBilling,validateChargeReceivableLink,
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
