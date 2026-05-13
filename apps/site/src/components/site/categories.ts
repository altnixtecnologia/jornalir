import type { CategorySlug, NewsItem } from "@ir/types";

export function getCategoryLabel(category: CategorySlug): string {
  const map: Record<CategorySlug, string> = {
    inicio: "Início",
    geral: "Geral",
    saude: "Saúde",
    esportes: "Esportes",
    policia: "Polícia",
    politica: "Política",
    colunistas: "Colunistas",
    sociais: "Sociais",
    "jornal-online": "Jornal Online",
    noticias: "Notícias"
  };

  return map[category];
}

export function groupByCategory(items: NewsItem[]): Record<CategorySlug, NewsItem[]> {
  return {
    inicio: items.filter((item) => item.category === "inicio"),
    geral: items.filter((item) => item.category === "geral"),
    saude: items.filter((item) => item.category === "saude"),
    policia: items.filter((item) => item.category === "policia"),
    politica: items.filter((item) => item.category === "politica"),
    colunistas: items.filter((item) => item.category === "colunistas"),
    sociais: items.filter((item) => item.category === "sociais"),
    "jornal-online": items.filter((item) => item.category === "jornal-online"),
    noticias: items.filter((item) => item.category === "noticias"),
    esportes: items.filter((item) => item.category === "esportes")
  };
}
