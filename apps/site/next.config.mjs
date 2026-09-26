/** @type {import('next').NextConfig} */
const isVercel = process.env.VERCEL === "1";

const nextConfig = {
  // Keep local dev cache custom dir, but use default production output on Vercel.
  distDir: isVercel ? ".next" : ".next-devcache",
  transpilePackages: ["@ir/ui", "@ir/types", "@ir/mocks", "@ir/config"],
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      canvas: false
    };
    return config;
  },
  // Fase 32 — rotas antigas de categoria (mock) com equivalência real
  // segura de editoria: redirect permanente para `/editoria/[slug]`.
  // Só as que têm um `editorial_sections.slug` correspondente de verdade
  // no banco — nunca um redirect genérico "chutando" a editoria certa.
  async redirects() {
    return [
      { source: "/geral", destination: "/editoria/geral", permanent: true },
      { source: "/esportes", destination: "/editoria/esporte", permanent: true },
      { source: "/policia", destination: "/editoria/policia", permanent: true },
      { source: "/politica", destination: "/editoria/politica", permanent: true }
    ];
  }
};

export default nextConfig;
