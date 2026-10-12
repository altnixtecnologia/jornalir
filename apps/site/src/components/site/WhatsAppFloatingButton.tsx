"use client";

import { useEffect, useState } from "react";
import { contactInfo } from "./siteSettings";

const MESSAGE = "Olá, vim pelo site do Informativo Regional.";
const WHATSAPP_URL = `https://wa.me/${contactInfo.phoneRaw}?text=${encodeURIComponent(MESSAGE)}`;

export function WhatsAppFloatingButton(): JSX.Element {
  const [nearFooter, setNearFooter] = useState(false);

  useEffect(() => {
    let frame = 0;

    function updateVisibility(): void {
      frame = 0;
      const footer = document.querySelector<HTMLElement>(".site-footer");
      if (!footer) {
        setNearFooter(false);
        return;
      }

      const rect = footer.getBoundingClientRect();
      // Some um pouco antes de o rodapé entrar na tela; evita aquele
      // efeito de "pular" e também não duplica o WhatsApp das redes.
      setNearFooter(rect.top <= window.innerHeight + 80);
    }

    function schedule(): void {
      if (frame) return;
      frame = window.requestAnimationFrame(updateVisibility);
    }

    updateVisibility();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Falar no WhatsApp"
      className={`whatsapp-float ${nearFooter ? "is-hidden" : ""}`}
    >
      <img src="/brand/social-whatsapp.png" alt="" />
    </a>
  );
}
