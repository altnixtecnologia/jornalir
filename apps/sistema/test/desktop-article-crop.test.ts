import test from "node:test";
import assert from "node:assert/strict";
import {centerCropForAspect,cropSourcePixels,moveCrop} from "../src/features/editorial/desktopCropMath";

test("proporções recortadas preservam o aspecto da foto",()=>{
 const img={width:4000,height:3000};
 for(const aspect of [1,16/9,3/4,9/16]){
  const r=centerCropForAspect(img.width,img.height,aspect);
  assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=1&&r.y+r.h<=1);
  assert.ok(Math.abs((r.w*img.width)/(r.h*img.height)-aspect)<1e-10);
 }
});

test("mover seleção nunca sai da foto",()=>{
 const r={x:.1,y:.2,w:.5,h:.6};
 assert.deepEqual(moveCrop(r,5,-3),{x:.5,y:0,w:.5,h:.6});
});

test("coordenadas da seleção são extraídas da foto original sem esticar",()=>{
 assert.deepEqual(cropSourcePixels({x:.25,y:.25,w:.5,h:.5},4000,3000),{
  x:1000,y:750,width:2000,height:1500,
 });
 const cut=cropSourcePixels({x:.9,y:.95,w:.3,h:.3},100,100);
 assert.ok(cut.x+cut.width<=100 && cut.y+cut.height<=100);
});
