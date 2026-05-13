export type Status = "ativo" | "inativo";

export type CategorySlug =
  | "inicio"
  | "geral"
  | "saude"
  | "esportes"
  | "policia"
  | "politica"
  | "colunistas"
  | "sociais"
  | "jornal-online"
  | "noticias";

export interface NewsItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: CategorySlug;
  imageUrl: string;
  publishedAt: string;
  author: string;
  readMinutes: number;
  isFeatured?: boolean;
}

export interface Sponsor {
  id: string;
  nome: string;
  logo: string;
  status: Status;
  cliques: number;
}

export type AdFormat = "card" | "destaque" | "lista";

export interface AdItem {
  id: string;
  titulo: string;
  marca: string;
  formato: AdFormat;
  status: Status;
  inicio: string;
  fim: string;
  cliques: number;
}
