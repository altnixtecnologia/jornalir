"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { contactInfo } from "./siteSettings";

const MESSAGE = "Olá, vim pelo site do Informativo Regional.";
const WHATSAPP_URL = `https://wa.me/${contactInfo.phoneRaw}?text=${encodeURIComponent(MESSAGE)}`;

interface DockState {
  x: number;
  y: number;
  scale: number;
}

export function WhatsAppFloatingButton(): JSX.Element {
  const buttonRef = useRef<HTMLAnchorElement>(null);
  const [dock, setDock] = useState<DockState | null>(null);

  useEffect(() => {
    let frame = 0;

    function updateDock(): void {
      frame = 0;
      const button = buttonRef.current;
      const target = document.querySelector<HTMLElement>("[data-footer-whatsapp]");
      if (!button || !target) {
        setDock(null);
        return;
      }

      const targetRect = target.getBoundingClientRect();
      const targetVisible = targetRect.top < window.innerHeight && targetRect.bottom > 0;
      if (!targetVisible) {
        setDock(null);
        return;
      }

      const computed = window.getComputedStyle(button);
      const right = Number.parseFloat(computed.right) || 0;
      const bottom = Number.parseFloat(computed.bottom) || 0;
      const width = button.offsetWidth || 1;
      const height = button.offsetHeight || 1;

      const baseCenterX = window.innerWidth - right - width / 2;
      const baseCenterY = window.innerHeight - bottom - height / 2;
      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;

      setDock({
        x: targetCenterX - baseCenterX,
        y: targetCenterY - baseCenterY,
        scale: Math.max(0.35, Math.min(1, targetRect.width / width)),
      });
    }

    function schedule(): void {
      if (frame) return;
      frame = window.requestAnimationFrame(updateDock);
    }

    updateDock();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  const style: CSSProperties | undefined = dock
    ? { transform: `translate3d(${dock.x}px, ${dock.y}px, 0) scale(${dock.scale})` }
    : undefined;

  return (
    <a
      ref={buttonRef}
      href={WHATSAPP_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Falar no WhatsApp"
      className={`whatsapp-float ${dock ? "is-docked" : ""}`}
      style={style}
    >
      <img src="/brand/social-whatsapp.png" alt="" />
    </a>
  );
}
