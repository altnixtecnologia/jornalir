import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/sistema",
    name: "Jornal IR - Sistema",
    short_name: "IR Sistema",
    description: "Painel administrativo e agenda do Informativo Regional",
    start_url: "/sistema",
    scope: "/",
    display: "standalone",
    background_color: "#fffefa",
    theme_color: "#30305c",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-ir-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-ir-512.png", sizes: "512x512", type: "image/png", purpose: "any" }
    ],
  };
}
