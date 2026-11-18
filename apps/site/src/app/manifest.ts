import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Informativo Regional",
    short_name: "Informativo",
    description: "Portal de noticias regional com leitura rapida e experiencia instalavel.",
    id: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f4ef",
    theme_color: "#30305c",
    orientation: "portrait",
    lang: "pt-BR",
    icons: [
      {
        src: "/icons/icon-ir-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/icon-ir-512.png",
        sizes: "512x512",
        type: "image/png",
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
