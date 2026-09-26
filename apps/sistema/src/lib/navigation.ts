export interface AdminModule {
  slug: string;
  label: string;
  description: string;
  planned: boolean;
}

export const adminModules: readonly AdminModule[] = [
  {
    slug: "",
    label: "Início",
    description: "Seu ponto de partida para a operação do jornal.",
    planned: false,
  },
  {
    slug: "editorial",
    label: "Editorial",
    description: "Da pauta à publicação, um espaço para organizar a redação.",
    planned: false,
  },
  {
    slug: "clientes",
    label: "Clientes",
    description:
      "Pessoas, empresas e seus vínculos com o jornal em um cadastro central.",
    planned: true,
  },
  {
    slug: "financeiro",
    label: "Financeiro",
    description: "Contas, recebimentos e a visão financeira de cada produto.",
    planned: true,
  },
  {
    slug: "assinaturas",
    label: "Assinaturas",
    description: "Acompanhamento de assinantes e suas assinaturas.",
    planned: true,
  },
  {
    slug: "publicidade",
    label: "Publicidade",
    description: "Anunciantes, espaços e períodos de veiculação.",
    planned: true,
  },
  {
    slug: "aniversariantes",
    label: "Aniversariantes",
    description: "A agenda da comunidade, de quinta-feira a quarta-feira.",
    planned: true,
  },
  {
    slug: "whatsapp",
    label: "WhatsApp",
    description: "Atendimento e comunicação vinculados aos contatos do jornal.",
    planned: true,
  },
  {
    slug: "entrevistas",
    label: "Entrevistas",
    description: "Conversas, convidados e conteúdo em áudio e vídeo.",
    planned: true,
  },
  {
    slug: "relatorios",
    label: "Relatórios",
    description: "Informações para acompanhar a operação e apoiar decisões.",
    planned: true,
  },
  {
    slug: "configuracoes",
    label: "Configurações",
    description: "Preferências, equipe e organização do ambiente de trabalho.",
    planned: true,
  },
];

export function moduleHref(slug: string): string {
  return slug ? `/sistema/${slug}` : "/sistema";
}

export function getActiveModule(pathname: string): AdminModule {
  const slug = pathname.split("/")[2] ?? "";
  const moduleSlug =
    slug === "anuncios" || slug === "patrocinadores" ? "publicidade" : slug;
  return (
    adminModules.find((item) => item.slug === moduleSlug) ?? adminModules[0]
  );
}

// --- Navegação do header superior (Fase 13) ---
// Estrutura própria do header, além de `adminModules` (que continua servindo
// os stubs de módulo planejado em `[module]/page.tsx`). Editorial é o único
// grupo com submenu hoje; os demais módulos (todos planejados) ficam juntos
// em "Mais módulos" para o topo nunca virar uma fileira interminável.

export interface AdminNavLink {
  label: string;
  href: string;
  /** Destaca o item como ação principal do dia a dia (ex.: Nova matéria). */
  primary?: boolean;
}

export interface AdminNavGroup {
  label: string;
  links: AdminNavLink[];
  /** true quando todo o grupo é composto por módulos ainda não desenvolvidos. */
  planned?: boolean;
}

export const editorialNavGroup: AdminNavGroup = {
  label: "Editorial",
  links: [
    { label: "Matérias", href: "/sistema/editorial/materias" },
    { label: "Nova matéria", href: "/sistema/editorial/materias/nova", primary: true },
    { label: "Importar do jornal impresso", href: "/sistema/editorial/importar-pdf" },
    { label: "Edições", href: "/sistema/editorial/edicoes" },
    { label: "Editorias", href: "/sistema/editorial/editorias" },
    { label: "Localidades", href: "/sistema/editorial/localidades" },
    { label: "Mídias", href: "/sistema/editorial/midias" },
  ],
};

export const moreModulesNavGroup: AdminNavGroup = {
  label: "Mais módulos",
  planned: true,
  links: adminModules
    .filter((item) => item.planned)
    .map((item) => ({ label: item.label, href: moduleHref(item.slug) })),
};
