"use client";
import { useEffect, useRef, useState, type PointerEvent as Pointer } from "react";
import styles from "./PreUploadImageCrop.module.css";

type Ratio = "free" | "1:1" | "4:3" | "16:9" | "3:4" | "9:16";
const RATIOS: { id: Ratio; ratio: number | null }[] = [
  { id: "free", ratio: null }, { id: "1:1", ratio: 1 },
  { id: "4:3", ratio: 4 / 3 }, { id: "16:9", ratio: 16 / 9 },
  { id: "3:4", ratio: 3 / 4 }, { id: "9:16", ratio: 9 / 16 },
];
interface Props {
  file: File; index: number; total: number;
  onCrop: (file: File) => void | Promise<void>; onOriginal: () => void; onCancel: () => void;
  mode?: "before-upload" | "after-upload";
}
type Pt = { x: number; y: number };
export function PreUploadImageCrop({ file, index, total, onCrop, onOriginal, onCancel, mode = "before-upload" }: Props): JSX.Element {
  const [src, setSrc] = useState("");
  const [size, setSize] = useState<Pt | null>(null);
  const [viewport, setViewport] = useState<Pt>({ x: 560, y: 360 });
  const [ratio, setRatio] = useState<Ratio>("free");
  const [extent, setExtent] = useState(90);
  const [freeHeight, setFreeHeight] = useState(90);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pt>({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const imageRef = useRef<HTMLImageElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const fingers = useRef(new Map<number, Pt>());
  const initialGesture = useRef<{ distance: number; zoom: number; origin: Pt } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url); setSize(null); setPan({x:0,y:0}); setZoom(1); setRatio("free");
    setExtent(90); setFreeHeight(90); setError("");
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    const node = viewRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setViewport({x:rect.width,y:rect.height});
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = old; };
  }, []);

  const fit = size ? Math.min(viewport.x / size.x, viewport.y / size.y) : 1;
  const fittedW = (size?.x || viewport.x) * fit;
  const fittedH = (size?.y || viewport.y) * fit;
  const forcedRatio = RATIOS.find((r) => r.id === ratio)?.ratio;
  const maxW = fittedW * 0.98;
  const maxH = fittedH * 0.98;
  const baseW = forcedRatio ? Math.min(maxW, maxH * forcedRatio) : maxW;
  const baseH = forcedRatio ? baseW / forcedRatio : maxH;
  const cropW = baseW * extent / 100;
  const cropH = baseH * (forcedRatio ? extent : freeHeight) / 100;

  function clampedPan(next: Pt, nextZoom = zoom): Pt {
    return {
      x: Math.max(-Math.max(0, (fittedW * nextZoom - cropW) / 2),
        Math.min(Math.max(0, (fittedW * nextZoom - cropW) / 2), next.x)),
      y: Math.max(-Math.max(0, (fittedH * nextZoom - cropH) / 2),
        Math.min(Math.max(0, (fittedH * nextZoom - cropH) / 2), next.y)),
    };
  }
  function setMagnification(next: number): void {
    const value = Math.min(5, Math.max(1, next));
    setZoom(value);
    setPan((old) => clampedPan(old, value));
  }
  function down(event: Pointer<HTMLDivElement>): void {
    if (busy || !size) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    fingers.current.set(event.pointerId, {x:event.clientX,y:event.clientY});
    const points = [...fingers.current.values()];
    if (points.length === 1) initialGesture.current = {
      distance:0, zoom, origin:{x:points[0].x-pan.x,y:points[0].y-pan.y},
    };
    if (points.length === 2) initialGesture.current = {
      distance:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y),
      zoom, origin:{x:0,y:0},
    };
  }
  function move(event: Pointer<HTMLDivElement>): void {
    if (!fingers.current.has(event.pointerId) || !initialGesture.current) return;
    fingers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const points=[...fingers.current.values()];
    if (points.length === 2 && initialGesture.current.distance > 0) {
      const distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
      setMagnification(initialGesture.current.zoom * distance / Math.max(1,initialGesture.current.distance));
    } else if (points.length === 1 && initialGesture.current.distance === 0) {
      setPan(clampedPan({x:points[0].x-initialGesture.current.origin.x,
        y:points[0].y-initialGesture.current.origin.y}));
    }
  }
  function up(event: Pointer<HTMLDivElement>): void {
    fingers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    initialGesture.current=null;
    if(fingers.current.size===1) {
      const pt=[...fingers.current.values()][0];
      initialGesture.current={distance:0,zoom,origin:{x:pt.x-pan.x,y:pt.y-pan.y}};
    }
  }

  async function apply(): Promise<void> {
    if (!size || !imageRef.current || busy) return;
    setBusy(true); setError("");
    try {
      const displayedScale=fit*zoom;
      const sx=size.x/2+(-cropW/2-pan.x)/displayedScale;
      const sy=size.y/2+(-cropH/2-pan.y)/displayedScale;
      const sw=cropW/displayedScale, sh=cropH/displayedScale;
      if (sx < -0.7 || sy < -0.7 || sx+sw > size.x+0.7 || sy+sh > size.y+0.7) {
        throw new Error("Enquadre a foto dentro da área de corte.");
      }
      const downscale=Math.min(1,3500/Math.max(sw,sh));
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(sw*downscale));
      canvas.height=Math.max(1,Math.round(sh*downscale));
      const ctx=canvas.getContext("2d");
      if (!ctx) throw new Error("Edição de imagens indisponível.");
      ctx.imageSmoothingQuality="high";
      ctx.drawImage(imageRef.current,Math.max(0,sx),Math.max(0,sy),
        Math.min(sw,size.x),Math.min(sh,size.y),0,0,canvas.width,canvas.height);
      const blob=await new Promise<Blob>((resolve,reject)=>
        canvas.toBlob((data)=>data?resolve(data):reject(new Error("Não foi possível gerar o recorte.")),"image/jpeg",0.9));
      await onCrop(new File([blob],file.name.replace(/\.[^.]+$/,"")+"-recortada.jpg",{type:"image/jpeg"}));
    } catch (cause) {setError(cause instanceof Error?cause.message:"Falha no recorte.");}
    finally {setBusy(false);}
  }

  return <div className={styles.backdrop}>
    <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="crop-before-upload-title">
      <header className={styles.header}>
        <div><small>{mode === "after-upload" ? "AJUSTAR IMAGEM ENVIADA" : `PREPARAR IMAGEM ${index+1} DE ${total}`}</small>
          <h2 id="crop-before-upload-title" title={file.name}>{file.name}</h2></div>
        <button type="button" onClick={onCancel} disabled={busy} aria-label="Fechar edição da imagem">✕</button>
      </header>
      <p className={styles.hint}>Arraste para enquadrar, faça zoom com dois dedos ou use os controles abaixo.</p>
      <div ref={viewRef} className={styles.viewport} onPointerDown={down} onPointerMove={move}
        onPointerUp={up} onPointerCancel={up} onWheel={(event)=>{
          event.preventDefault();setMagnification(zoom+(event.deltaY>0?-0.15:0.15));
        }}>
        {src ? <img ref={imageRef} src={src} alt="Imagem original para recortar" draggable={false}
          onLoad={(event)=>setSize({x:event.currentTarget.naturalWidth,y:event.currentTarget.naturalHeight})}
          onError={()=>setError("A prévia não abriu neste navegador. Use a imagem original.")}
          style={{transform:"translate("+pan.x+"px,"+pan.y+"px) scale("+zoom+")"}} /> : null}
        {size ? <div className={styles.frame} style={{width:cropW,height:cropH}} aria-hidden="true">
          <i /><i /><i /><i />
        </div>:null}
      </div>
      <div className={styles.controls}>
        <fieldset><legend>Proporção do recorte</legend><div className={styles.ratios}>
          {RATIOS.map((r)=><button type="button" key={r.id} disabled={busy}
            aria-pressed={ratio===r.id} onClick={()=>{
              setRatio(r.id);setExtent(90);setFreeHeight(90);setPan({x:0,y:0});setZoom(1);
            }}>{r.id==="free"?"Livre":r.id}</button>)}
        </div></fieldset>
        <div className={styles.sliders}>
          <label>Zoom <input type="range" min={100} max={500} step={5} value={zoom*100}
            onChange={(e)=>setMagnification(Number(e.target.value)/100)} /></label>
          <label>Largura <input type="range" min={20} max={100} value={extent}
            onChange={(e)=>{setExtent(Number(e.target.value));setPan({x:0,y:0});}} /></label>
          {ratio==="free"?<label>Altura <input type="range" min={20} max={100} value={freeHeight}
            onChange={(e)=>{setFreeHeight(Number(e.target.value));setPan({x:0,y:0});}} /></label>:null}
        </div>
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p>:null}
      <footer className={styles.footer}>
        <button type="button" disabled={busy} onClick={onCancel}>{mode === "after-upload" ? "Fechar" : "Cancelar envio"}</button>
        <button type="button" disabled={busy} onClick={onOriginal}>{mode === "after-upload" ? "Manter original" : "Usar original"}</button>
        <button type="button" disabled={busy||!size} className={styles.primary} onClick={()=>void apply()}>
          {busy ? "Salvando…" : mode === "after-upload" ? "Salvar recorte" : "Aplicar recorte"}</button>
      </footer>
    </section>
  </div>;
}
