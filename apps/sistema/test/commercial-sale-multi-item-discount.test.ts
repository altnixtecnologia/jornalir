import test from "node:test";
import assert from "node:assert/strict";
import type { CommercialProduct } from "@ir/types";
import { CommercialSaleService } from "@ir/core";
import {
  calculateCommercialSaleTotals,
  toNewCommercialSaleServiceInput,
  toCommercialSaleServiceInput,
  type CommercialSaleFormInput,
} from "../src/app/sistema/publicidade/vendas/commercialSaleFormTypes";

const products: CommercialProduct[] = [
  {id:"product-led",name:"Painéis LED",channel:"led_panel",suggestedPrice:350,active:true,createdAt:"2026-01-01",updatedAt:"2026-01-01"},
  {id:"product-newspaper",name:"Anúncio no jornal",channel:"newspaper",suggestedPrice:200,active:true,createdAt:"2026-01-01",updatedAt:"2026-01-01"},
  {id:"product-disabled",name:"Produto inativo",channel:"other",suggestedPrice:40,active:false,createdAt:"2026-01-01",updatedAt:"2026-01-01"},
];

const input = (overrides: Partial<CommercialSaleFormInput>={}): CommercialSaleFormInput => ({
  clientId:"client-demo",productId:"",channel:"",description:"",
  startDate:"2026-11-17",endDate:"2026-12-17",amount:"1",
  commercialCondition:"cash",installmentsCount:"1",notes:"",
  discountMode:"percentage",discountValue:"10",
  items:[
    {productId:"product-led",manualName:"",unitPrice:"350"},
    {productId:"product-newspaper",manualName:"",unitPrice:"200"},
  ],
  ...overrides,
});

test("venda com vários produtos calcula total no servidor, ignorando amount do navegador", async () => {
  const sale = toNewCommercialSaleServiceInput(input(), products);
  assert.equal(sale.amount,495);
  assert.equal(sale.channel,"Pacote/combinado");
  assert.equal(sale.itemsSnapshot?.length,2);
  assert.equal(sale.itemsSnapshot?.reduce((sum,item)=>sum+item.totalAmount,0),495);
  assert.equal(sale.itemsSnapshot?.reduce((sum,item)=>sum+item.discountAmount,0),55);
  assert.deepEqual(sale.itemsSnapshot?.map((item)=>item.productName),["Painéis LED","Anúncio no jornal"]);
  assert.deepEqual(sale.itemsSnapshot?.map((item)=>item.sortOrder),[0,1]);
  let saved:unknown;
  const repository={
    create:async(row:unknown)=>{saved=row;return {...row as object,id:"test-sale",reference:"IR-V-001"} as any;},
    list:async()=>[],getById:async()=>null,update:async()=>{throw new Error("Unexpected update");},
  };
  const service=new CommercialSaleService(repository as any);
  await service.register(sale);
  assert.ok(saved);
  assert.equal((saved as {amount:number}).amount,495);
});

test("desconto em R$ distribuído sem perder centavos, inclusive preço 0",()=>{
  const sale=toNewCommercialSaleServiceInput(input({
    items:[
      {productId:"",manualName:"Serviço A",unitPrice:"10.01"},
      {productId:"",manualName:"Serviço B",unitPrice:"15.02"},
      {productId:"",manualName:"Cortesia",unitPrice:"0"},
    ],
    discountMode:"amount",discountValue:"5.03",
  }),products);
  assert.equal(sale.amount,20);
  assert.equal(sale.itemsSnapshot?.reduce((n,x)=>n+x.totalAmount,0),20);
  assert.equal(sale.itemsSnapshot?.reduce((n,x)=>n+x.discountAmount,0),5.03);
  assert.ok(sale.itemsSnapshot?.every(x=>x.totalAmount>=0));
});

test("desconto de 100% e valores de tabela ficam congelados no snapshot",()=>{
  const sale=toNewCommercialSaleServiceInput(input({
    items:[{productId:"product-led",manualName:"",unitPrice:"300"}],
    discountMode:"percentage",discountValue:"100",
  }),products);
  assert.equal(sale.amount,0);
  assert.equal(sale.itemsSnapshot?.[0].listUnitPrice,350);
  assert.equal(sale.itemsSnapshot?.[0].unitPrice,300);
  assert.equal(sale.itemsSnapshot?.[0].discountAmount,300);
});

test("desconto inválido não gera venda e produto inativo não passa no servidor",()=>{
  assert.throws(()=>toNewCommercialSaleServiceInput(input({discountMode:"percentage",discountValue:"101"}),products),/100%/);
  assert.throws(()=>toNewCommercialSaleServiceInput(input({discountMode:"amount",discountValue:"9999"}),products),/superar/);
  assert.throws(()=>toNewCommercialSaleServiceInput(input({items:[{productId:"product-disabled",manualName:"",unitPrice:"1"}]}),products),/não está mais ativo/);
  assert.throws(()=>toNewCommercialSaleServiceInput(input({items:[{productId:"",manualName:"",unitPrice:"1"}]}),products),/nome/);
  assert.throws(()=>toNewCommercialSaleServiceInput(input({items:[{productId:"",manualName:"Livre",unitPrice:"1.555"}]}),products),/duas casas/);
});

test("prévia em reais e em porcentagem e edição antiga continuam independentes",()=>{
  assert.deepEqual(calculateCommercialSaleTotals([{unitPrice:"100"},{unitPrice:"50"}],"percentage","10"),{subtotal:150,discount:15,total:135});
  assert.deepEqual(calculateCommercialSaleTotals([{unitPrice:"100"},{unitPrice:"50"}],"amount","20"),{subtotal:150,discount:20,total:130});
  const legacy=toCommercialSaleServiceInput(input({amount:"350",productId:"product-led",channel:"Painel LED",description:"Venda antiga"}));
  assert.equal(legacy.amount,350);
  assert.ok(!("itemsSnapshot" in legacy));
});
