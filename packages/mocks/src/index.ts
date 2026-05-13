import type { AdItem, NewsItem, Sponsor } from "@ir/types";

export const newsData: NewsItem[] = [
  {
    id: "n1",
    slug: "festival-regional-movimenta-cidade",
    title: "Festival regional movimenta o centro com cultura e turismo",
    excerpt: "Evento reuniu moradores, visitantes e pequenos negocios em um fim de semana de programacao intensa.",
    content: "A cidade recebeu uma programacao especial com artistas locais, gastronomia e atividades para familias.",
    category: "noticias",
    imageUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80",
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
    imageUrl: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1200&q=80",
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
    imageUrl: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80",
    publishedAt: "2026-05-03T18:20:00-03:00",
    author: "Editor de Esportes",
    readMinutes: 2
  }
];

export const sponsorsData: Sponsor[] = [
  { id: "s1", nome: "Super Cooper", logo: "https://placehold.co/96x96?text=SC", status: "ativo", cliques: 1280 },
  { id: "s2", nome: "Sicoob Credi", logo: "https://placehold.co/96x96?text=SI", status: "ativo", cliques: 940 },
  { id: "s3", nome: "RMSTelecom", logo: "https://placehold.co/96x96?text=RMS", status: "inativo", cliques: 430 }
];

export const adsData: AdItem[] = [
  {
    id: "a1",
    titulo: "Especial Dia das Maes",
    marca: "Super Cooper",
    formato: "card",
    status: "ativo",
    inicio: "2026-05-01",
    fim: "2026-05-31",
    cliques: 312
  },
  {
    id: "a2",
    titulo: "Credito para pequenos negocios",
    marca: "Sicoob Credi",
    formato: "destaque",
    status: "ativo",
    inicio: "2026-05-03",
    fim: "2026-06-03",
    cliques: 198
  }
];
