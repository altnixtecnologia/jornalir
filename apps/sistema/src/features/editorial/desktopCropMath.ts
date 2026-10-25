export type CropRect = {x:number;y:number;w:number;h:number};
export type CropPoint = {x:number;y:number};
export function clamp01(n:number):number{return Math.max(0,Math.min(1,n));}
/** Coordenadas são frações da FOTO, não da tela. Evita distorção do crop ao redimensionar a janela. */
export function centerCropForAspect(width:number,height:number,aspect:number|null):CropRect{
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)
  throw new Error("Imagem sem dimensões válidas.");
 let w=.9,h=.9;
 if(aspect&&aspect>0){
  if(w*width/(h*height)>aspect)w=h*height*aspect/width;
  else h=w*width/(height*aspect);
 }
 return {x:(1-w)/2,y:(1-h)/2,w,h};
}
export function moveCrop(rect:CropRect,dx:number,dy:number):CropRect{
 return {...rect,x:Math.max(0,Math.min(1-rect.w,rect.x+dx)),y:Math.max(0,Math.min(1-rect.h,rect.y+dy))};
}
/** Renderização usando a imagem ORIGINAL como fonte, pixels inteiros e sem esticar. */
export function cropSourcePixels(rect:CropRect,width:number,height:number){
 if(width<=0||height<=0)throw new Error("Imagem inválida.");
 const x=Math.max(0,Math.min(width-1,Math.floor(clamp01(rect.x)*width)));
 const y=Math.max(0,Math.min(height-1,Math.floor(clamp01(rect.y)*height)));
 const right=Math.max(x+1,Math.min(width,Math.ceil(clamp01(rect.x+rect.w)*width)));
 const bottom=Math.max(y+1,Math.min(height,Math.ceil(clamp01(rect.y+rect.h)*height)));
 return {x,y,width:right-x,height:bottom-y};
}
