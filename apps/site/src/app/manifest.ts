import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Informativo Regional",
    short_name: "Informativo",
    description: "Portal de noticias regional com leitura rapida e experiencia instalavel.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f4ef",
    theme_color: "#0b6e4f",
    orientation: "portrait",
    lang: "pt-BR",
    icons: [
      {
        src: "/icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any"
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any"
      },
      {
        src: "/icons/maskable-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
