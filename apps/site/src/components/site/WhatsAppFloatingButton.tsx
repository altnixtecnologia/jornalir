"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { contactInfo } from "./siteSettings";

const MESSAGE = "Olá, vim pelo site do Informativo Regional.";
const WHATSAPP_URL = `https://wa.me/${contactInfo.phoneRaw}?text=${encodeURIComponent(MESSAGE)}`;

interface FloatOffset {
  x: number;
  y: number;
  scale: number;
  docked: boolean;
}

export function WhatsAppFloatingButton(): JSX.Element {
  const buttonRef = useRef<HTMLAnchorElement>(null);
  const [offset, setOffset] = useState<FloatOffset | null>(null);

  useEffect(() => {
    let frame = 0;

    function updatePosition(): void {
      frame = 0;
      const button = buttonRef.current;
      if (!button) return;

      const computed = window.getComputedStyle(button);
      const right = Number.parseFloat(computed.right) || 0;
      const bottom = Number.parseFloat(computed.bottom) || 0;
      const width = button.offsetWidth || 1;
      const height = button.offsetHeight || 1;
      const baseLeft = window.innerWidth - right - width;
      const baseTop = window.innerHeight - bottom - height;
      const baseCenterX = baseLeft + width / 2;
      const baseCenterY = baseTop + height / 2;

      const footerTarget = document.querySelector<HTMLElement>("[data-footer-whatsapp]");
      if (footerTarget) {
        const targetRect = footerTarget.getBoundingClientRect();
        const targetVisible = targetRect.top < window.innerHeight && targetRect.bottom > 0;
        if (targetVisible) {
          const targetCenterX = targetRect.left + targetRect.width / 2;
          const targetCenterY = targetRect.top + targetRect.height / 2;
          setOffset({
            x: targetCenterX - baseCenterX,
            y: targetCenterY - baseCenterY,
            scale: Math.max(0.35, Math.min(1, targetRect.width / width)),
            docked: true,
          });
          return;
        }
      }

      // No hero mobile o botão nunca deve cobrir manchete/subtítulo.
      if (window.innerWidth <= 767) {
        const heroCopy = document.querySelector<HTMLElement>(".hero-copy");
        if (heroCopy) {
          const copyRect = heroCopy.getBoundingClientRect();
          const copyVisible = copyRect.top < window.innerHeight && copyRect.bottom > 0;
          if (copyVisible) {
            const safeTop = Math.max(96, copyRect.top - height - 14);
            setOffset({ x: 0, y: Math.min(0, safeTop - baseTop), scale: 1, docked: false });
            return;
          }
        }
      }

      // No desktop, quando o menu que fica após o hero encostar no botão,
      // ele sobe o suficiente para não cobrir o Assine nem os ícones.
      if (window.innerWidth >= 768) {
        const siteHeader = document.querySelector<HTMLElement>(".site-header");
        if (siteHeader) {
          const headerRect = siteHeader.getBoundingClientRect();
          const headerVisible = headerRect.top < window.innerHeight && headerRect.bottom > 0;
          const wouldOverlap = baseTop < headerRect.bottom && baseTop + height > headerRect.top;
          if (headerVisible && wouldOverlap) {
            const safeTop = Math.max(12, headerRect.top - height - 12);
            setOffset({ x: 0, y: safeTop - baseTop, scale: 1, docked: false });
            return;
          }
        }
      }

      setOffset(null);
    }

    function schedule(): void {
      if (frame) return;
      frame = window.requestAnimationFrame(updatePosition);
    }

    updatePosition();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  const style: CSSProperties | undefined = offset
    ? { transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${offset.scale})` }
    : undefined;

  return (
    <a
      ref={buttonRef}
      href={WHATSAPP_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Falar no WhatsApp"
      className={`whatsapp-float ${offset?.docked ? "is-docked" : ""}`}
      style={style}
    >
      <img src="/brand/social-whatsapp.png" alt="" />
    </a>
  );
}
