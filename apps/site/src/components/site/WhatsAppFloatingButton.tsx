import { contactInfo } from "./siteSettings";

const MESSAGE = "Olá, vim pelo site do Informativo Regional.";
const WHATSAPP_URL = `https://wa.me/${contactInfo.phoneRaw}?text=${encodeURIComponent(MESSAGE)}`;

/**
 * Botão flutuante do WhatsApp — mesmo ícone já usado no header/rodapé
 * (`/brand/social-whatsapp.png`), sem novo asset. `wa.me` já resolve
 * automaticamente para WhatsApp Web (desktop sem app) ou o app instalado
 * (mobile), sem lógica extra de detecção de dispositivo.
 */
export function WhatsAppFloatingButton(): JSX.Element {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Falar no WhatsApp"
      className="whatsapp-float"
    >
      <img src="/brand/social-whatsapp.png" alt="" />
    </a>
  );
}
