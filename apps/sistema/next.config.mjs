/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ir/ui", "@ir/types", "@ir/core", "@ir/mocks", "@ir/config", "@ir/pdf-extraction"],
  experimental: {
    // Uploads editoriais (fotos/PDF) passam por Server Actions. O padrão
    // do Next é pequeno demais para uma edição impressa em PDF.
    serverActions: {
      bodySizeLimit: "100mb",
    },
    // pdfjs-dist (usado por @ir/pdf-extraction, só em Server Actions) faz
    // detecção dinâmica de ambiente Node que o webpack não processa bem;
    // mantê-lo como dependência externa do runtime do servidor evita que o
    // bundler tente empacotá-lo e preserva o comportamento nativo em Node.
    serverComponentsExternalPackages: ["pdfjs-dist"],
  },
};

export default nextConfig;
