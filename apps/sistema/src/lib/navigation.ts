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
