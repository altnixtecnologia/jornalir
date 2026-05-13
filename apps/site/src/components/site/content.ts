import type { AdItem, NewsItem } from "@ir/types";

export interface SponsoredSlot extends AdItem {
  imagem: string;
  descricao: string;
  cta: string;
}

export const expandedNewsData: NewsItem[] = [
  {
    id: "n1",
    slug: "festival-regional-movimenta-cidade",
    title: "Festival regional movimenta o centro com cultura e turismo",
    excerpt: "Evento reuniu moradores, visitantes e pequenos negocios em um fim de semana de programacao intensa.",
    content: "A cidade recebeu uma programacao especial com artistas locais, gastronomia e atividades para familias.",
    category: "noticias",
    imageUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1400&q=80",
    publishedAt: "2026-05-05T10:30:00-03:00",
    author: "Redacao Informativo Regional",
    readMinutes: 4,
    isFeatured: true
  },
  {
    id: "n2",
    slug: "escolas-recebem-novas-salas-digitais",
    title: "Escolas municipais recebem novas salas digitais",
    excerpt: "Investimento busca ampliar acesso a tecnologia e fortalecer a aprendizagem no interior.",
    content: "As unidades passam a contar com novos computadores, conectividade e formacao para professores.",
    category: "geral",
    imageUrl: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1400&q=80",
    publishedAt: "2026-05-04T14:00:00-03:00",
    author: "Equipe Local",
    readMinutes: 3
  },
  {
    id: "n3",
    slug: "time-local-vence-final",
    title: "Time local vence final e levanta a taca regional",
    excerpt: "Partida decisiva teve casa cheia e emocao ate os ultimos minutos.",
    content: "Com gol no segundo tempo, equipe garantiu o titulo e comemorou com a torcida.",
    category: "esportes",
    imageUrl: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1400&q=80",
    publishedAt: "2026-05-03T18:20:00-03:00",
    author: "Editor de Esportes",
    readMinutes: 2
  },
  {
    id: "n4",
    slug: "cooperativas-lancam-programa-de-emprego",
    title: "Cooperativas lancam programa de emprego para jovens",
    excerpt: "Projeto abre vagas de estagio e trilhas de capacitacao em parceria com escolas.",
    content: "O programa comeca neste mes com foco em tecnologia, atendimento e gestao.",
    category: "noticias",
    imageUrl: "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1400&q=80",
    publishedAt: "2026-05-02T11:10:00-03:00",
    author: "Redacao Economia",
    readMinutes: 5
  },
  {
    id: "n5",
    slug: "rodovia-recebe-novas-obras-de-seguranca",
    title: "Rodovia recebe novas obras de seguranca e sinalizacao",
    excerpt: "Trechos com maior fluxo terao melhorias para reduzir acidentes no periodo de safra.",
    content: "As intervencoes incluem iluminacao, sinalizacao e reforco de acostamento.",
    category: "geral",
    imageUrl: "https://images.unsplash.com/photo-1465447142348-e9952c393450?auto=format&fit=crop&w=1400&q=80",
    publishedAt: "2026-05-01T08:40:00-03:00",
    author: "Equipe Infraestrutura",
    readMinutes: 4
  }
];

export const sponsoredSlots: SponsoredSlot[] = [
  {
    id: "a1",
    titulo: "Especial Dia das Maes",
    marca: "Super Cooper",
    formato: "card",
    status: "ativo",
    inicio: "2026-05-01",
    fim: "2026-05-31",
    cliques: 312,
    imagem: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=1400&q=80",
    descricao: "Ofertas locais com entrega rapida e apoio ao comercio da regiao.",
    cta: "Conhecer campanha"
  },
  {
    id: "a2",
    titulo: "Credito para pequenos negocios",
    marca: "Sicoob Credi",
    formato: "destaque",
    status: "ativo",
    inicio: "2026-05-03",
    fim: "2026-06-03",
    cliques: 198,
    imagem: "https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1400&q=80",
    descricao: "Linhas negociadas para empreendedores da cidade e zona rural.",
    cta: "Falar com gerente"
  }
];
