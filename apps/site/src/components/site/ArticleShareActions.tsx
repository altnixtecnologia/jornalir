"use client";

import { useEffect, useRef, useState } from "react";

interface Props { title: string; slug: string; }
const PUBLIC_ORIGIN = "https://jornalir.vercel.app";

function ShareSymbol({ name }: { name: "share" | "copy" | "whatsapp" | "instagram" | "facebook" | "more" }): JSX.Element {
  if (name === "facebook") return <span aria-hidden="true" className="text-lg font-black leading-none">f</span>;
  if (name === "instagram") return <span aria-hidden="true" className="text-xl font-bold leading-none">◎</span>;
  if (name === "whatsapp") return <span aria-hidden="true" className="text-lg leading-none">◉</span>;
  if (name === "more") return <span aria-hidden="true" className="text-xl leading-none">↗</span>;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "copy" ? (
        <>
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
        </>
      ) : (
        <>
          <circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" />
          <circle cx="18" cy="19" r="2" /><path d="m8 11 8-5M8 13l8 5" />
        </>
      )}
    </svg>
  );
}

/** Instagram não suporta compartilhar URL diretamente no feed ou Stories.
 * Tentamos o seletor nativo do Android, com cópia do link como fallback.
 */
export function ArticleShareActions({ title, slug }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const articleUrl = PUBLIC_ORIGIN + "/noticias/" + encodeURIComponent(slug);
  const shareText = title + "\n" + articleUrl;
  const whatsappUrl = "https://api.whatsapp.com/send?text=" + encodeURIComponent(shareText);
  const facebookUrl = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(articleUrl);

  function notify(value: string): void {
    setMessage(value);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(""), 5200);
  }
  useEffect(() => {
    function outside(event: PointerEvent): void {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setExpanded(false);
    }
    function escape(event: KeyboardEvent): void {
      if (event.key === "Escape") setExpanded(false);
    }
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  async function copyLink(): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(articleUrl);
        return true;
      }
    } catch { /* WebView: usar seleção temporária */ }
    try {
      const temporary = document.createElement("textarea");
      temporary.value = articleUrl;
      temporary.setAttribute("readonly", "");
      temporary.style.position = "fixed";
      temporary.style.opacity = "0";
      document.body.appendChild(temporary);
      temporary.focus();
      temporary.select();
      const success = document.execCommand("copy");
      temporary.remove();
      return success;
    } catch { return false; }
  }
  async function handleCopy(): Promise<void> {
    const copied = await copyLink();
    notify(copied ? "Link copiado! Já pode enviar a notícia." :
      "Não foi possível copiar automaticamente. Selecione o endereço da matéria e copie.");
    if (copied) setExpanded(false);
  }
  async function nativeShare(instagram = false): Promise<void> {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: title, url: articleUrl });
        setExpanded(false);
        notify("Compartilhamento concluído.");
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          if (instagram) notify("Se o Instagram não apareceu, use Copiar link e cole no Direct.");
          return;
        }
      }
    }
    if (instagram) {
      const copied = await copyLink();
      notify(copied ?
        "Link copiado! Cole no Direct do Instagram. Não é possível publicar esse link diretamente no feed ou Stories." :
        "Para compartilhar pelo Instagram, copie o endereço da notícia e cole no Direct.");
      if (copied) setExpanded(false);
      return;
    }
    notify("Compartilhamento nativo indisponível. Use Copiar link, WhatsApp ou Facebook.");
  }

  const optionStyle = "flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--site-line)] px-3 text-left font-semibold transition hover:bg-[color:var(--site-bg)]";

  return (
    <div ref={root} className="relative mt-4 inline-block max-w-full">
      <button type="button" onClick={() => setExpanded(open => !open)}
        aria-expanded={expanded} aria-controls="ir-article-share-options"
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[color:var(--site-line)] bg-[color:var(--site-surface)] px-4 py-2 text-sm font-semibold text-[color:var(--brand-navy)] shadow-sm transition hover:border-[color:var(--brand-red)] hover:text-[color:var(--brand-red)] focus-visible:outline-2 focus-visible:outline-offset-2">
        <ShareSymbol name="share" /> Compartilhar
      </button>
      {expanded ? (
        <div id="ir-article-share-options"
          className="absolute left-0 top-full z-40 mt-2 w-[min(330px,calc(100vw-40px))] rounded-2xl border border-[color:var(--site-line)] bg-[color:var(--site-surface)] p-4 shadow-2xl"
          role="group" aria-label="Compartilhar esta matéria">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[color:var(--site-muted)]">Compartilhe esta notícia</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <button type="button" onClick={() => void handleCopy()} className={optionStyle}>
              <ShareSymbol name="copy" /> Copiar link
            </button>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
              onClick={() => setExpanded(false)} className={optionStyle}>
              <ShareSymbol name="whatsapp" /> WhatsApp
            </a>
            <a href={facebookUrl} target="_blank" rel="noopener noreferrer"
              onClick={() => setExpanded(false)} className={optionStyle}>
              <ShareSymbol name="facebook" /> Facebook
            </a>
            <button type="button" onClick={() => void nativeShare(true)} className={optionStyle}
              title="Usa compartilhar do celular ou copia o link para o Instagram Direct">
              <ShareSymbol name="instagram" /> Instagram
            </button>
          </div>
          <button type="button" onClick={() => void nativeShare()}
            className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[color:var(--site-bg)] px-3 text-xs font-bold text-[color:var(--site-text)] transition hover:text-[color:var(--brand-red)]">
            <ShareSymbol name="more" /> Mais opções do celular
          </button>
          <p className="mt-2 text-[11px] leading-snug text-[color:var(--site-muted)]">
            Instagram: selecione-o no compartilhamento do celular ou cole o link no Direct.
          </p>
        </div>
      ) : null}
      {message ? (
        <p role="status" aria-live="polite"
          className="mt-2 max-w-sm rounded-lg bg-[color:var(--site-bg)] px-3 py-2 text-xs font-semibold leading-snug text-[color:var(--site-text)]">
          {message}
        </p>
      ) : null}
    </div>
  );
}
