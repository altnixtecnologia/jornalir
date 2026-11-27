import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {listReportExcludedReceivableIds,withoutExcludedReceivables} from "../src/providers/supabase/receivableReportExclusion.supabase";

const fakeClient=(result:{data?:Array<{id:string}>|null;error?:{code?:string;message:string}|null})=>({
 from:()=>({select:()=>({not:()=>({limit:async()=>({data:result.data??null,error:result.error??null})})})}),
}) as never;

test("lista IDs classificados como teste",async()=>{
 assert.deepEqual(await listReportExcludedReceivableIds(fakeClient({data:[{id:"a"},{id:"b"}]})),["a","b"]);
 assert.deepEqual(await listReportExcludedReceivableIds(fakeClient({data:null})),[]);
});
test("coluna ainda inexistente não quebra relatórios; outros erros são propagados",async()=>{
 assert.deepEqual(await listReportExcludedReceivableIds(fakeClient({error:{code:"42703",message:"column does not exist"}})),[]);
 await assert.rejects(()=>listReportExcludedReceivableIds(fakeClient({error:{code:"XX000",message:"boom"}})),/boom/);
});
test("filtro só é aplicado quando há IDs",()=>{
 const calls:string[][]=[];
 const query={not(column:string,operator:string,value:string){calls.push([column,operator,value]);return query;}};
 assert.equal(withoutExcludedReceivables(query,"id",[]),query);
 assert.equal(calls.length,0);
 withoutExcludedReceivables(query,"receivable_id",["x","y"]);
 assert.deepEqual(calls,[["receivable_id","in","(x,y)"]]);
});
test("relatórios, visão financeira e consulta central usam a exclusão; migration é só aditiva",()=>{
 const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
 for(const file of [
  "../src/providers/supabase/receivableRepository.supabase.ts",
  "../src/providers/supabase/financialOverview.supabase.ts",
  "../src/app/api/integrations/altnix/finance-preview/route.ts",
 ])assert.match(read(file),/withoutExcludedReceivables/,file);
 const sql=read("../../../supabase/migrations/20261127150000_receivables_report_exclusion.sql");
 assert.doesNotMatch(sql,/\b(delete|truncate|drop|update)\b\s+(from\s+|table\s+|column\s+)?public\./i);
 assert.match(sql,/add column if not exists report_excluded_at/);
});
