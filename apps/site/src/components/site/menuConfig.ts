import type { CategorySlug } from "@ir/types";

export interface MenuItemConfig {
  href: string;
  label: string;
  category: CategorySlug;
}

export const menuItems: MenuItemConfig[] = [
  { href: "/", label: "INÍCIO", category: "inicio" },
  { href: "/geral", label: "GERAL", category: "geral" },
  { href: "/saude", label: "SAÚDE", category: "saude" },
  { href: "/esportes", label: "ESPORTES", category: "esportes" },
  { href: "/policia", label: "POLÍCIA", category: "policia" },
  { href: "/politica", label: "POLÍTICA", category: "politica" },
  { href: "/colunistas", label: "COLUNISTAS", category: "colunistas" },
  { href: "/sociais", label: "SOCIAIS", category: "sociais" },
  { href: "/jornal-online", label: "JORNAL ONLINE", category: "jornal-online" },
  { href: "/materias", label: "MATÉRIAS", category: "noticias" },
  { href: "/sobre", label: "SOBRE", category: "inicio" },
  { href: "/contato", label: "CONTATO", category: "inicio" }
];
