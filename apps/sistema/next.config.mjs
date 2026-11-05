/** @type {import('next').NextConfig} */

// Build local roda dentro de uma pasta sincronizada pelo OneDrive — dois
// efeitos observados e corrigidos aqui (02/11/2026, falha de build local
// relatada pelo usuário):
// 1) a "Collecting page data" da rota /sistema/financeiro/contratos/[id]
//    (a mais pesada do app em módulos importados) passa do timeout padrão
//    de 60s só por I/O lento do OneDrive, não por um bug real — confirmado
//    isolando a página compilada (require direto: ~0.3s) e repetindo o
//    build com timeout maior, que passou dessa etapa.
// 2) a etapa seguinte "Collecting build traces" (nodeFileTrace/@vercel/nft)
//    falha de forma determinística com "UNKNOWN: unknown error, read"
//    lendo arquivos via reparse point do OneDrive. Essa etapa só gera os
//    .nft.json usados por `output: "standalone"`/runtime serverless, que
//    este projeto não usa.
//
// Nenhum dos dois ajustes é desejável em produção (Vercel builda em
// nuvem, sem OneDrive — lá o padrão do Next já funciona e deve ser
// preservado intacto). Por isso ficam condicionados a uma variável
// explícita de build local, nunca aplicados por padrão.
const isLocalOneDriveBuild = process.env.IR_LOCAL_ONEDRIVE_BUILD === "1";

const nextConfig = {
  ...(isLocalOneDriveBuild
    ? { staticPageGenerationTimeout: 180, outputFileTracing: false }
    : {}),
  transpilePackages: ["@ir/ui", "@ir/types", "@ir/core", "@ir/mocks", "@ir/config", "@ir/pdf-extraction"],
  // Links de assinatura carregam tokens de acesso. Evitar indexação e
  // vazamento do token no cabeçalho Referer quando o navegador abre recursos.
  async headers() {
    return [{
      source: "/assinar-contrato-comercial/:token",
      headers: [
        {key: "Referrer-Policy", value: "no-referrer"},
        {key: "X-Robots-Tag", value: "noindex, nofollow, noarchive"},
        {key: "Cache-Control", value: "private, no-store"},
      ],
    }, {
      // Bloco D (02/11/2026) — mesmo cuidado do link de assinatura comercial:
      // o token de complementação cadastral também não pode ser indexado
      // nem vazar no Referer de recursos abertos a partir da página.
      source: "/complementar-cadastro/:token",
      headers: [
        {key: "Referrer-Policy", value: "no-referrer"},
        {key: "X-Robots-Tag", value: "noindex, nofollow, noarchive"},
        {key: "Cache-Control", value: "private, no-store"},
      ],
    }];
  },

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
    // @napi-rs/canvas (reaproveitamento de PDF do acervo R2 em
    // editionCoverRenderer.ts, chamado agora por uma Server Action) carrega
    // um binário nativo (.node) por plataforma — o webpack tenta parsear
    // esse binário como módulo JS e quebra o build sem esta exclusão.
    serverComponentsExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  },
};

export default nextConfig;
