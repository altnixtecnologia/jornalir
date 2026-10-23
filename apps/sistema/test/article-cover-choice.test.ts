import test from "node:test";
import assert from "node:assert/strict";
import type { ArticleMedia } from "@ir/types";
import { setCoverMedia } from "../src/features/editorial/articleMediaState";

const selected:ArticleMedia[]=[
 {mediaAssetId:"foto-a",role:"cover",order:0},
 {mediaAssetId:"foto-b",role:"gallery",order:0},
 {mediaAssetId:"foto-c",role:"gallery",order:1},
];
test("estrela promove foto da galeria e mantém capa anterior vinculada",()=>{
 const next=setCoverMedia(selected,"foto-b");
 assert.equal(next[0].mediaAssetId,"foto-b");
 assert.equal(next[0].role,"cover");
 assert.equal(next[1].mediaAssetId,"foto-a");
 assert.equal(next[1].role,"gallery");
 assert.equal(next.filter(x=>x.mediaAssetId==="foto-b").length,1);
});
test("troca preserva foto, crédito e legenda das imagens",()=>{
 const next=setCoverMedia([
  {...selected[0],caption:"Legenda original",credit:"Crédito original"},
  ...selected.slice(1),
 ],"foto-c");
 const previous=next.find(x=>x.mediaAssetId==="foto-a");
 assert.equal(previous?.caption,"Legenda original");
 assert.equal(previous?.credit,"Crédito original");
 assert.deepEqual(next.filter(x=>x.role==="gallery").map(x=>x.order),[0,1]);
});
test("redefinir a mesma capa não duplica arquivo",()=>{
 const next=setCoverMedia(selected,"foto-a");
 assert.deepEqual(next,selected);
});
