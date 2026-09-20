import type { AdItem } from "@ir/types";
import type { SiteArticle } from "./siteArticleTypes";

export interface SponsoredSlot extends AdItem {
  imagem: string;
  descricao: string;
  cta: string;
}

/**
 * Conteúdo de demonstração (Fase 14 — pré-definição visual). Quantidade e
 * variedade suficientes para avaliar manchete/rotação, matérias secundárias,
 * matéria sem foto, com uma foto e com galeria, editorias diferentes e
 * localidades. Nenhuma integração de dados nova: mesmo mecanismo já
 * existente (mock → IndexedDB via `newsStorage.ts`).
 */
export const expandedNewsData: SiteArticle[] = [
  {
    id: "n1",
    slug: "festival-regional-movimenta-cidade",
    title: "Festival regional movimenta o centro com cultura e turismo",
    subtitle: "Programação especial reuniu artistas locais, gastronomia e atividades para famílias durante todo o fim de semana",
    excerpt: "Evento reuniu moradores, visitantes e pequenos negócios em um fim de semana de programação intensa.",
    content:
      "<p>A cidade recebeu uma programação especial com artistas locais, gastronomia e atividades para famílias durante os três dias de festival.</p><p>Comerciantes da região relataram aumento expressivo no movimento, com filas em barracas de comida típica desde o início da tarde. A prefeitura estima que o evento tenha recebido mais de oito mil visitantes ao longo do fim de semana.</p><p>A organização já confirmou uma nova edição para o próximo ano, com data prevista para o mesmo período.</p>",
    category: "noticias",
    locality: "Torres",
    imageUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1600&q=80",
    credit: "Ana Beatriz Souza",
    gallery: [
      { url: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80", caption: "Público reunido durante a abertura do festival.", credit: "Ana Beatriz Souza" },
      { url: "https://images.unsplash.com/photo-1508997449629-303059a039c0?auto=format&fit=crop&w=1200&q=80", caption: "Apresentação musical no palco principal.", credit: "Ana Beatriz Souza" },
      { url: "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1200&q=80", caption: "Barracas de gastronomia local.", credit: "Ana Beatriz Souza" },
      { url: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1200&q=80" }
    ],
    publishedAt: "2026-05-05T10:30:00-03:00",
    author: "Redação Informativo Regional",
    readMinutes: 4,
    isFeatured: true
  },
  {
    id: "n2",
    slug: "escolas-recebem-novas-salas-digitais",
    title: "Escolas municipais recebem novas salas digitais",
    excerpt: "Investimento busca ampliar acesso a tecnologia e fortalecer a aprendizagem no interior.",
    content:
      "<p>As unidades passam a contar com novos computadores, conectividade e formação para professores.</p><p>A secretaria de educação informou que a segunda etapa do projeto deve alcançar mais doze escolas até o fim do ano letivo.</p>",
    category: "geral",
    locality: "São João do Sul",
    imageUrl: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1400&q=80",
    publishedAt: "2026-05-04T14:00:00-03:00",
    author: "Equipe Local",
    readMinutes: 3,
    isFeatured: true
  },
  {
    id: "n3",
    slug: "time-local-vence-final",
    title: "Time local vence final e levanta a taça regional",
    subtitle: "Gol no segundo tempo decidiu a partida diante de casa cheia",
    excerpt: "Partida decisiva teve casa cheia e emoção até os últimos minutos.",
    content:
      "<p>Com gol no segundo tempo, a equipe garantiu o título e comemorou com a torcida ainda dentro de campo.</p><p>É o terceiro título regional da história do clube, e o primeiro em seis anos. O técnico destacou o trabalho de base como principal responsável pela conquista.</p>",
    category: "esportes",
    locality: "Passo de Torres",
    imageUrl: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1600&q=80",
    credit: "Marcos Vinícius",
    gallery: [
      { url: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1200&q=80", caption: "Comemoração da equipe após o apito final.", credit: "Marcos Vinícius" },
      { url: "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1200&q=80", caption: "Torcida lotou as arquibancadas.", credit: "Marcos Vinícius" },
      { url: "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1200&q=80" },
      { url: "https://images.unsplash.com/photo-1551958219-acbc608c6377?auto=format&fit=crop&w=1200&q=80", caption: "Levantamento da taça." },
      { url: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=80" }
    ],
    publishedAt: "2026-05-03T18:20:00-03:00",
    author: "Editor de Esportes",
    readMinutes: 2,
    isFeatured: true
  },
  {
    id: "n4",
    slug: "cooperativas-lancam-programa-de-emprego",
    title: "Cooperativas lançam programa de emprego para jovens",
    excerpt: "Projeto abre vagas de estágio e trilhas de capacitação em parceria com escolas.",
    content:
      "<p>O programa começa neste mês com foco em tecnologia, atendimento e gestão.</p><p>As inscrições são gratuitas e seguem abertas até o fim do mês nas unidades participantes.</p>",
    category: "noticias",
    imageUrl: "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1400&q=80",
    publishedAt: "2026-05-02T11:10:00-03:00",
    author: "Redação Economia",
    readMinutes: 5
  },
  {
    id: "n5",
    slug: "rodovia-recebe-novas-obras-de-seguranca",
    title: "Rodovia recebe novas obras de segurança e sinalização",
    excerpt: "Trechos com maior fluxo terão melhorias para reduzir acidentes no período de safra.",
    content:
      "<p>As intervenções incluem iluminação, sinalização e reforço de acostamento nos pontos de maior risco.</p>",
    category: "geral",
    locality: "Região",
    imageUrl: "https://images.unsplash.com/photo-1465447142348-e9952c393450?auto=format&fit=crop&w=1400&q=80",
    publishedAt: "2026-05-01T08:40:00-03:00",
    author: "Equipe Infraestrutura",
    readMinutes: 4,
    isFeatured: true
  },
  {
    id: "n6",
    slug: "camara-aprova-investimento-em-iluminacao",
    title: "Câmara aprova investimento em iluminação pública",
    subtitle: "Recursos serão destinados a bairros da orla",
    excerpt: "Sessão desta semana aprovou por unanimidade o repasse para modernização da iluminação em três bairros.",
    content:
      "<p>A sessão desta semana aprovou por unanimidade o repasse para modernização da iluminação em três bairros da orla.</p><p>A previsão é que as obras comecem ainda neste semestre, com prazo de conclusão de noventa dias.</p>",
    category: "politica",
    locality: "São João do Sul",
    imageUrl: "https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1400&q=80",
    credit: "Divulgação/Câmara Municipal",
    publishedAt: "2026-05-06T08:30:00-03:00",
    author: "Editor de Política",
    readMinutes: 3,
    isFeatured: true
  },
  {
    id: "n7",
    slug: "operacao-policial-resulta-em-apreensao",
    title: "Operação policial resulta em apreensão em Passo de Torres",
    excerpt: "Equipes da polícia civil e militar realizaram ação conjunta na madrugada desta quinta-feira.",
    content:
      "<p>Equipes da polícia civil e militar realizaram ação conjunta na madrugada desta quinta-feira, resultando em duas apreensões.</p>",
    category: "policia",
    locality: "Passo de Torres",
    imageUrl: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1400&q=80",
    publishedAt: "2026-05-06T21:15:00-03:00",
    author: "Redação Polícia",
    readMinutes: 2
  },
  {
    id: "n8",
    slug: "campanha-de-vacinacao-comeca-nesta-semana",
    title: "Campanha de vacinação contra a gripe começa nesta semana",
    excerpt: "Postos de saúde vão funcionar em horário estendido durante o primeiro fim de semana.",
    content:
      "<p>Postos de saúde vão funcionar em horário estendido durante o primeiro fim de semana da campanha.</p><p>A meta é imunizar 80% do público prioritário até o fim do mês.</p>",
    category: "saude",
    locality: "Região",
    imageUrl: "https://images.unsplash.com/photo-1584982751601-97dcc096659c?auto=format&fit=crop&w=1400&q=80",
    publishedAt: "2026-05-07T09:00:00-03:00",
    author: "Redação Saúde",
    readMinutes: 3
  },
  {
    id: "n9",
    slug: "opiniao-o-futuro-do-turismo-na-regiao",
    title: "O futuro do turismo na região começa nas pequenas decisões",
    excerpt: "Coluna de opinião sobre os caminhos para o turismo sustentável na costa sul.",
    content:
      "<p>O turismo na nossa região cresceu nos últimos anos, mas ainda depende de decisões estruturais que vão além da temporada de verão.</p><p>Investir em infraestrutura, sinalização e capacitação é o que vai diferenciar quem vive do turismo o ano inteiro de quem depende só de janeiro.</p>",
    category: "colunistas",
    imageUrl: "",
    publishedAt: "2026-05-07T07:00:00-03:00",
    author: "Marina Petry",
    readMinutes: 4
  },
  {
    id: "n10",
    slug: "feira-de-produtores-reune-familias",
    title: "Feira de produtores reúne famílias em Passo de Torres",
    excerpt: "Evento mensal aproxima produtores rurais dos consumidores da região.",
    content:
      "<p>O evento mensal segue reunindo produtores rurais e famílias da região em um só espaço.</p>",
    category: "geral",
    locality: "Passo de Torres",
    imageUrl: "",
    publishedAt: "2026-04-30T10:00:00-03:00",
    author: "Editor-chefe",
    readMinutes: 2
  },
  {
    id: "n11",
    slug: "encontro-social-reune-comunidade-no-clube",
    title: "Encontro social reúne comunidade no clube da cidade",
    excerpt: "Noite de confraternização celebrou aniversário de fundação da entidade.",
    content:
      "<p>A noite de confraternização celebrou o aniversário de fundação da entidade, reunindo associados e convidados.</p><p>O evento contou com jantar, música ao vivo e homenagens a fundadores.</p>",
    category: "sociais",
    locality: "Torres",
    imageUrl: "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=1600&q=80",
    credit: "Equipe Sociais",
    gallery: [
      { url: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1200&q=80" },
      { url: "https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=1200&q=80", caption: "Homenagem aos fundadores da entidade." },
      { url: "https://images.unsplash.com/photo-1478147427282-58a87a120781?auto=format&fit=crop&w=1200&q=80" }
    ],
    publishedAt: "2026-04-29T20:00:00-03:00",
    author: "Coluna Social",
    readMinutes: 3
  },
  {
    id: "n12",
    slug: "prefeitura-anuncia-calendario-de-vacinacao",
    title: "Prefeitura anuncia calendário de vacinação para o próximo semestre",
    excerpt: "Cronograma inclui doses de reforço e ampliação de pontos de atendimento.",
    content:
      "<p>O cronograma inclui doses de reforço e a ampliação dos pontos de atendimento em toda a rede municipal.</p>",
    category: "saude",
    locality: "Região",
    imageUrl: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1400&q=80",
    publishedAt: "2026-04-28T07:30:00-03:00",
    author: "Redação Saúde",
    readMinutes: 3
  },
  {
    id: "n13",
    slug: "comercio-local-espera-aumento-nas-vendas",
    title: "Comércio local espera aumento nas vendas no fim de ano",
    excerpt: "Levantamento preliminar aponta expectativa positiva entre pequenos negócios da região.",
    content:
      "<p>Levantamento preliminar aponta expectativa positiva entre pequenos negócios da região para o fim do ano.</p>",
    category: "noticias",
    locality: "Região",
    imageUrl: "https://images.unsplash.com/photo-1556155092-490a1ba16284?auto=format&fit=crop&w=1400&q=80",
    publishedAt: "2026-04-27T13:20:00-03:00",
    author: "Redação Economia",
    readMinutes: 3
  }
];

export const sponsoredSlots: SponsoredSlot[] = [
  {
    id: "a1",
    titulo: "Especial Dia das Mães",
    marca: "Super Cooper",
    formato: "card",
    status: "ativo",
    inicio: "2026-05-01",
    fim: "2026-05-31",
    cliques: 312,
    imagem: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=1400&q=80",
    descricao: "Ofertas locais com entrega rápida e apoio ao comércio da região.",
    cta: "Conhecer campanha"
  },
  {
    id: "a2",
    titulo: "Crédito para pequenos negócios",
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
