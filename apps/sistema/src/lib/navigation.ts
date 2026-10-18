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
    slug: "agenda",
    label: "Agenda",
    description: "Compromissos da equipe e pauta operacional da semana.",
    planned: false,
  },
  {
    slug: "clientes",
    label: "Clientes",
    description:
      "Pessoas, empresas e seus vínculos com o jornal em um cadastro central.",
    planned: false,
  },
  {
    slug: "financeiro",
    label: "Financeiro",
    description: "Contas a receber, recebimentos e contratos institucionais.",
    planned: false,
  },
  {
    slug: "assinaturas",
    label: "Assinaturas",
    description: "Serviços (impresso, digital, TV) vinculados a um cliente.",
    planned: false,
  },
  {
    slug: "nfse",
    label: "NFS-e",
    description: "Configuração fiscal, perfis de serviço e rascunhos de NFS-e.",
    planned: false,
  },
  {
    slug: "publicidade",
    label: "Comercial",
    description: "Propostas, vendas, anunciantes e vínculo com o Financeiro.",
    planned: false,
  },
  {
    slug: "aniversariantes",
    label: "Aniversariantes",
    description: "A agenda da comunidade, de quinta-feira a quarta-feira.",
    planned: false,
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
    description: "Usuários, patrocinadores do site e demais preferências.",
    planned: false,
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
  /** Somente para o proprietário ativo. */
  ownerOnly?: boolean;
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
    { label: "Destaques", href: "/sistema/editorial/destaques" },
    { label: "Importar do jornal impresso", href: "/sistema/editorial/importar-pdf" },
    { label: "Edições", href: "/sistema/editorial/edicoes" },
    { label: "Editorias", href: "/sistema/editorial/editorias" },
    { label: "Localidades", href: "/sistema/editorial/localidades" },
    { label: "Mídias", href: "/sistema/editorial/midias" },
  ],
};

export const clientesNavGroup: AdminNavGroup = {
  label: "Cadastros",
  links: [
    { label: "Cadastros", href: "/sistema/clientes" },
  ],
};

export const assinaturasNavGroup: AdminNavGroup = {
  label: "Assinaturas",
  links: [
    { label: "Assinaturas", href: "/sistema/assinaturas" },
  ],
};

export const financeiroNavGroup: AdminNavGroup = {
  label: "Financeiro",
  links: [
    { label: "Visão geral", href: "/sistema/financeiro" },
    { label: "Contas a receber", href: "/sistema/financeiro/contas-a-receber" },
    { label: "Contratos institucionais", href: "/sistema/financeiro/contratos" },
    { label: "Recibos", href: "/sistema/financeiro/recibos" },
    { label: "Relatórios", href: "/sistema/financeiro/relatorios" },
  ],
};

export const commercialNavGroup: AdminNavGroup = {
  label: "Comercial",
  links: [
    { label: "Visão geral", href: "/sistema/publicidade" },
    { label: "Solicitações do site", href: "/sistema/publicidade/solicitacoes" },
    { label: "Propostas/Orçamentos", href: "/sistema/publicidade/propostas" },
    { label: "Vendas", href: "/sistema/publicidade/vendas" },
    { label: "Produtos/serviços", href: "/sistema/publicidade/produtos" },
  ],
};

export const nfseNavGroup: AdminNavGroup = {
  label: "NFS-e",
  links: [
    { label: "Visão geral", href: "/sistema/nfse" },
    { label: "Rascunhos", href: "/sistema/nfse/rascunhos" },
    { label: "Notas emitidas", href: "/sistema/nfse/notas" },
    { label: "Perfis de serviço", href: "/sistema/nfse/perfis-servico" },
    { label: "Configurações", href: "/sistema/nfse/configuracoes" },
  ],
};

export const configuracoesNavGroup: AdminNavGroup = {
  label: "Configurações",
  links: [
    { label: "Usuários", href: "/sistema/usuarios" },
    { label: "Assistente IR — Conversar", href: "/sistema/assistente-ir", ownerOnly: true },
    { label: "Assistente IR — Aprovações", href: "/sistema/assistente-ir/propostas", ownerOnly: true },
    { label: "Configurar Assistente IR", href: "/sistema/configuracoes/assistente-ir", ownerOnly: true },
    { label: "Patrocinadores do site", href: "/sistema/configuracoes/patrocinadores" },
    { label: "Notificações push", href: "/sistema/configuracoes/notificacoes-push" },
    { label: "Valores da página Assine", href: "/sistema/configuracoes/valores-assine" },
    { label: "Cobranças / Asaas", href: "/sistema/configuracoes/cobrancas" },
  ],
};

export const moreModulesNavGroup: AdminNavGroup = {
  label: "Mais módulos",
  planned: true,
  links: adminModules
    .filter((item) => item.planned)
    .map((item) => ({ label: item.label, href: moduleHref(item.slug) })),
};
