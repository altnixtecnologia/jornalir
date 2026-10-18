/**
 * Gerador editorial local de mensagens de aniversário — sem IA externa, sem
 * custo, sem rede. Cada template é um texto completo e natural (2-3 frases),
 * não um encaixe de fragmentos soltos — evita o efeito "Frankenstein".
 *
 * Cada template carrega metadados (`family`/`opening`/`ending` + quais dados
 * opcionais usa) para a seleção poder: (1) só escolher templates compatíveis
 * com os dados disponíveis da pessoa, e (2) evitar repetir a "cara" da
 * mensagem (mesma família/abertura/encerramento) entre pessoas da mesma
 * edição ou entre tentativas de "Trocar mensagem" da mesma pessoa.
 *
 * Linguagem neutra de propósito: o sistema não tem garantia de gênero do
 * aniversariante, então evitamos "cercado/cercada", "querido/querida" etc.
 * Quando "Profissão/atividade" já vem escrita num gênero (ex.: "Empresária"),
 * usamos a palavra exatamente como fornecida — nunca a inferimos do nome.
 */

export interface PersonProfile {
  name: string;
  city?: string;
  profession?: string;
  organization?: string;
  knownAs?: string;
  /** Frase editorial já pronta para uso (ex.: "Integrante da Associação Comercial"), ou ausente. */
  editorialPhrase?: string;
  /** "sexta-feira (10)" — data real do aniversário dentro da edição, nunca "hoje". */
  dateLabel?: string | null;
}

export interface GeneratedMessage {
  text: string;
  family: string;
  opening: string;
  ending: string;
}

interface TemplateNeeds {
  city?: boolean;
  profession?: boolean;
  organization?: boolean;
  knownAs?: boolean;
  editorialPhrase?: boolean;
  date?: boolean;
}

interface Template {
  family: string;
  opening: string;
  ending: string;
  needs: TemplateNeeds;
  render: (p: PersonProfile) => string;
}

function t(family: string, opening: string, ending: string, needs: TemplateNeeds, render: (p: PersonProfile) => string): Template {
  return { family, opening, ending, needs, render };
}

const TEMPLATES: Template[] = [
  // --- família "plain" — só o nome, sem dados opcionais ---
  t("plain", "person_leads", "parabens", {}, (p) => `${p.name} comemora mais um ano de vida nesta semana. Familiares e amigos desejam saúde, paz e boas conquistas nesta nova etapa. Parabéns!`),
  t("plain", "person_leads", "votos", {}, (p) => `${p.name} celebra nesta semana mais um aniversário. Quem acompanha sua caminhada deseja felicidade e muitos bons momentos pela frente.`),
  t("plain", "time_leads", "votos", {}, (p) => `É tempo de comemorar a vida de ${p.name}. Que este novo ciclo traga alegrias, conquistas e motivos de sobra para sorrir.`),
  t("plain", "time_leads", "votos", {}, (p) => `Mais um aniversário marca a semana de ${p.name}. Familiares e amigos desejam prosperidade e dias repletos de boas energias.`),
  t("plain", "people_lead", "votos", {}, (p) => `Familiares e amigos celebram mais um ano de vida de ${p.name}. Que os próximos dias sejam de paz, saúde e boas realizações.`),
  t("plain", "person_leads", "votos", {}, (p) => `${p.name} recebe nesta semana o carinho de familiares e amigos. Que venham novas conquistas e muitos motivos para celebrar.`),
  t("plain", "time_leads", "votos", {}, (p) => `A data é especial para ${p.name}, que completa mais um ano de vida. Os votos são de saúde, equilíbrio e boas surpresas.`),
  t("plain", "cycle_leads", "votos", {}, (p) => `Uma nova etapa começa para ${p.name}. Que ela seja marcada por bons encontros, conquistas e muita alegria.`),
  t("plain", "person_leads", "votos", {}, (p) => `${p.name} tem motivos de sobra para comemorar nesta semana. Que o novo ciclo traga leveza, saúde e boas novidades.`),
  t("plain", "cycle_leads", "none", {}, (p) => `Mais um ciclo de vida se inicia para ${p.name}, que recebe o carinho de familiares e amigos nesta semana.`),
  t("plain", "people_lead", "votos", {}, (p) => `Quem convive com ${p.name} tem motivos para celebrar nesta semana. Os desejos são de paz, saúde e dias tranquilos.`),
  t("plain", "person_leads", "votos", {}, (p) => `${p.name} soma mais um ano de vida e reforça os laços com quem está ao seu lado. Que venham novas conquistas.`),
  t("plain", "time_leads", "felicidades", {}, (p) => `Chega mais um aniversário na vida de ${p.name}, motivo de alegria para quem acompanha de perto. Muitas felicidades!`),
  t("plain", "person_leads", "votos", {}, (p) => `${p.name} entra em uma nova idade nesta semana. Os votos de familiares e amigos são de saúde e bons momentos ao longo do ano.`),
  t("plain", "time_leads", "votos", {}, (p) => `A semana reserva uma data especial para ${p.name}. Que os próximos ciclos tragam realizações e muita paz.`),

  // --- família "date" — usa o dia real da semana editorial ---
  t("date", "date_leads", "votos", { date: true }, (p) => `Nesta ${p.dateLabel}, é dia de celebrar ${p.name}. Os votos de familiares e amigos são de saúde e boas conquistas.`),
  t("date", "date_leads", "votos", { date: true }, (p) => `${(p.dateLabel ?? "").charAt(0).toUpperCase()}${(p.dateLabel ?? "").slice(1)} é a data de aniversário de ${p.name}. Que o novo ciclo venha repleto de alegrias e paz.`),
  t("date", "date_leads", "votos", { date: true }, (p) => `Na ${p.dateLabel}, ${p.name} completa mais um ano de vida. Familiares e amigos desejam boas energias e muitas conquistas.`),
  t("date", "person_leads", "votos", { date: true }, (p) => `${p.name} celebra o aniversário na ${p.dateLabel}. Que os próximos dias sejam de saúde, leveza e bons momentos.`),
  t("date", "date_leads", "felicidades", { date: true }, (p) => `A data é ${p.dateLabel}: dia de celebrar mais um ano de vida de ${p.name}. Muitas felicidades!`),
  t("date", "date_leads", "none", { date: true }, (p) => `Reserve a ${p.dateLabel} para lembrar de ${p.name}, que celebra mais um ano de vida nesta semana.`),

  // --- família "city_leads" — a cidade abre a frase ---
  t("city_leads", "city_leads", "votos", { city: true }, (p) => `${p.city} celebra nesta semana o aniversário de ${p.name}. A data recebe os cumprimentos de familiares e amigos, com votos de alegria e prosperidade.`),
  t("city_leads", "city_leads", "none", { city: true }, (p) => `Em ${p.city}, ${p.name} comemora mais um ano de vida nesta semana, ao lado de familiares e amigos.`),
  t("city_leads", "city_leads", "none", { city: true }, (p) => `${p.city} tem motivo de festa: é a semana de aniversário de ${p.name}.`),
  t("city_leads", "city_leads", "votos", { city: true }, (p) => `A cidade de ${p.city} celebra o aniversário de ${p.name} nesta semana, com votos de saúde e boas conquistas.`),

  // --- família "person_city" — a pessoa abre, cidade aparece depois ---
  t("person_city", "person_leads", "votos", { city: true }, (p) => `${p.name}, de ${p.city}, comemora mais um ano de vida nesta semana. Familiares e amigos desejam saúde e boas conquistas.`),
  t("person_city", "person_leads", "none", { city: true }, (p) => `${p.name} celebra, em ${p.city}, mais um aniversário nesta semana.`),
  t("person_city", "person_leads", "none", { city: true }, (p) => `Natural de ${p.city}, ${p.name} completa mais um ano de vida nesta semana.`),
  t("person_city", "person_leads", "none", { city: true }, (p) => `${p.name} vive mais uma data especial nesta semana, em ${p.city}.`),

  // --- família "profession_leads" — profissão abre, sem cidade ---
  t("profession_leads", "profession_leads", "parabens", { profession: true }, (p) => `${p.profession} ${p.name} comemora mais um ano de vida nesta semana. Familiares e amigos desejam saúde, sucesso e bons momentos nesta nova etapa. Parabéns!`),
  t("profession_leads", "profession_leads", "votos", { profession: true }, (p) => `${p.profession} ${p.name} celebra nesta semana mais um aniversário, com votos de saúde e prosperidade.`),
  t("profession_leads", "profession_leads", "none", { profession: true }, (p) => `${p.profession} ${p.name} soma mais um ano de vida nesta semana, ao lado de familiares e amigos.`),
  t("profession_leads", "time_leads", "none", { profession: true }, (p) => `Nesta semana, ${p.profession} ${p.name} celebra mais um ano de vida.`),

  // --- família "profession_city" — profissão + cidade ---
  t("profession_city", "profession_leads", "parabens", { profession: true, city: true }, (p) => `${p.profession} ${p.name}, de ${p.city}, comemora mais um ano de vida nesta semana. Familiares e amigos desejam saúde, sucesso e bons momentos nesta nova etapa. Parabéns!`),
  t("profession_city", "city_leads", "none", { profession: true, city: true }, (p) => `Em ${p.city}, ${p.profession} ${p.name} celebra mais um ano de vida nesta semana.`),
  t("profession_city", "city_leads", "none", { profession: true, city: true }, (p) => `${p.city} celebra nesta semana o aniversário de ${p.profession} ${p.name}.`),
  t("profession_city", "profession_leads", "none", { profession: true, city: true }, (p) => `${p.profession} ${p.name}, natural de ${p.city}, completa mais um ano de vida nesta semana.`),

  // --- família "profession_org" — profissão + empresa/entidade ---
  t("profession_org", "profession_leads", "none", { profession: true, organization: true }, (p) => `${p.profession} ${p.name}, da ${p.organization}, comemora mais um ano de vida nesta semana.`),
  t("profession_org", "person_leads", "none", { profession: true, organization: true }, (p) => `${p.name}, ${p.profession} da ${p.organization}, celebra mais um ano de vida nesta semana.`),
  t("profession_org", "org_leads", "none", { profession: true, organization: true }, (p) => `Na ${p.organization}, a atuação de ${p.name} como ${p.profession} é lembrada nesta semana de aniversário.`),

  // --- família "known_as" — apelido, com moderação ---
  t("known_as", "person_leads", "votos", { knownAs: true }, (p) => `${p.name}, ou simplesmente ${p.knownAs}, celebra mais um ano de vida nesta semana. Familiares e amigos desejam saúde e boas conquistas.`),
  t("known_as", "known_as_leads", "votos", { knownAs: true }, (p) => `Entre amigos, ${p.name} é mais conhecido como ${p.knownAs}. Nesta semana, celebra mais um ano de vida, com votos de paz e boas energias.`),

  // --- família "editorial_phrase" — só quando o reconhecedor de padrão seguro aprova ---
  t("editorial_phrase", "phrase_leads", "votos", { editorialPhrase: true }, (p) => `${p.editorialPhrase}, ${p.name} comemora mais um ano de vida nesta semana. Familiares e amigos desejam saúde e boas conquistas.`),
  t("editorial_phrase", "phrase_leads", "votos", { editorialPhrase: true }, (p) => `${p.editorialPhrase}, ${p.name} celebra mais um aniversário nesta semana, com votos de paz e prosperidade.`),
];

/**
 * Reconhece SOMENTE padrões explicitamente seguros em "Informações para a
 * mensagem" ("integrante de/da/do X", "membro de/da/do X"). Qualquer outra
 * frase é ignorada — nunca tentamos reinterpretar ou resumir texto livre.
 */
export function extractSafeEditorialPhrase(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const match = /^(integrante|membro)\s+(d[ao]s?|de)\s+(.+)$/i.exec(trimmed);
  if (!match) return undefined;
  const subject = match[1].toLowerCase() === "integrante" ? "Integrante" : "Membro";
  const connector = match[2].toLowerCase();
  const rest = match[3].trim().replace(/[.!?]+$/, "");
  if (!rest) return undefined;
  return `${subject} ${connector} ${rest}`;
}

function eligible(tpl: Template, p: PersonProfile): boolean {
  if (tpl.needs.city && !p.city) return false;
  if (tpl.needs.profession && !p.profession) return false;
  if (tpl.needs.organization && !(p.profession && p.organization)) return false;
  if (tpl.needs.knownAs && !p.knownAs) return false;
  if (tpl.needs.editorialPhrase && !p.editorialPhrase) return false;
  if (tpl.needs.date && !p.dateLabel) return false;
  return true;
}

/** PRNG determinístico (mulberry32) — mesma semente sempre gera a mesma sequência. */
function seededRandom(seed: number): () => number {
  let s = seed;
  return function next(): number {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) h = (h * 31 + input.charCodeAt(i)) | 0;
  return h;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface AvoidHints {
  family?: string;
  opening?: string;
  ending?: string;
}

/** Contagem de uso de cada família/abertura/encerramento já atribuídos na edição ATUAL inteira. */
export interface UsageCounts {
  family: Record<string, number>;
  opening: Record<string, number>;
  ending: Record<string, number>;
}

/**
 * Gera uma mensagem editorial para `profile`. Prioridade de variedade (olhando
 * a edição inteira, não só a pessoa anterior):
 * 1) template compatível com os dados disponíveis (`eligible`);
 * 2) texto ainda não usado por ninguém na edição (`usedTexts`);
 * 3) família estrutural menos usada na edição até agora (`usage.family`);
 * 4) abertura menos usada (`usage.opening`);
 * 5) encerramento menos usado (`usage.ending`);
 * 6) evitar repetir a família da mensagem imediatamente anterior (`avoidPrevious`)
 *    — da pessoa anterior na geração em lote, ou da própria pessoa em "Trocar mensagem".
 * Nunca recorre a timestamp/sufixo artificial — a diversidade vem só dos
 * templates reais; se o pool elegível se esgotar, reaproveita a melhor
 * opção disponível (extremamente raro, dado o tamanho do pool).
 */
export function generateBirthdayMessage(
  profile: PersonProfile,
  usedTexts: Set<string>,
  usage: UsageCounts,
  avoidPrevious: AvoidHints,
  seedKey: string,
): GeneratedMessage {
  const rng = seededRandom(hashString(seedKey));
  const candidates = TEMPLATES.filter((tpl) => eligible(tpl, profile));
  const pool = candidates.length > 0 ? candidates : TEMPLATES.filter((tpl) => Object.keys(tpl.needs).length === 0);

  const ordered = shuffle(pool, rng).sort((a, b) => {
    const familyDiff = (usage.family[a.family] ?? 0) - (usage.family[b.family] ?? 0);
    if (familyDiff !== 0) return familyDiff;
    const openingDiff = (usage.opening[a.opening] ?? 0) - (usage.opening[b.opening] ?? 0);
    if (openingDiff !== 0) return openingDiff;
    const endingDiff = (usage.ending[a.ending] ?? 0) - (usage.ending[b.ending] ?? 0);
    if (endingDiff !== 0) return endingDiff;
    const aPrev = a.family === avoidPrevious.family ? 1 : 0;
    const bPrev = b.family === avoidPrevious.family ? 1 : 0;
    return aPrev - bPrev;
  });

  for (const tpl of ordered) {
    const text = tpl.render(profile);
    if (!usedTexts.has(text)) {
      return { text, family: tpl.family, opening: tpl.opening, ending: tpl.ending };
    }
  }
  // Pool elegível inteiro já usado nesta edição (muito raro) — reaproveita a melhor opção mesmo repetida,
  // sem inventar ruído textual (timestamp/sufixo) dentro de uma mensagem editorial.
  const fallback = ordered[0] ?? TEMPLATES[0];
  return { text: fallback.render(profile), family: fallback.family, opening: fallback.opening, ending: fallback.ending };
}

/** "sexta-feira (10)" — usa a data real do aniversário dentro da edição, nunca "hoje". */
export function formatEditorialDayLabel(weekdayFullUpper: string, day: Date): string {
  return `${weekdayFullUpper.toLowerCase()} (${String(day.getDate()).padStart(2, "0")})`;
}

/** Rótulo editorial amigável de cada família de modelo — só para a tela "Ver
 * modelos" agrupar visualmente; nunca exibido na mensagem publicada. */
export const FAMILY_LABELS: Record<string, string> = {
  plain: "Simples",
  date: "Com a data da semana",
  city_leads: "Cidade em destaque",
  person_city: "Pessoa e cidade",
  profession_leads: "Profissão em destaque",
  profession_city: "Profissão e cidade",
  profession_org: "Profissão e instituição",
  known_as: "Como é conhecido",
  editorial_phrase: "Frase editorial",
  custom: "Modelos do administrador",
};

export interface TemplateSummary {
  /** Índice estável dentro de TEMPLATES nesta versão do código — usado só
   * para a seleção explícita de "Ver modelos" ser aplicada imediatamente
   * (nunca persistido como referência permanente fora desta requisição). */
  key: string;
  family: string;
  familyLabel: string;
  /** Pré-visualização com dados de exemplo, só para a biblioteca de modelos. */
  preview: string;
  needs: TemplateNeeds;
}

const PREVIEW_PROFILE: PersonProfile = {
  name: "Maria Aparecida",
  city: "Santa Rosa do Sul",
  profession: "Empresária",
  organization: "Câmara de Vereadores",
  knownAs: "Cida",
  editorialPhrase: "Integrante da Associação Comercial",
  dateLabel: "quinta-feira (16)",
};

/** Lista os 44 modelos originais com pré-visualização, para a tela "Ver
 * modelos" — nunca usado para gerar a mensagem publicada (ver renderTemplateByKey). */
export function listTemplateSummaries(): TemplateSummary[] {
  return TEMPLATES.map((tpl, index) => ({
    key: String(index),
    family: tpl.family,
    familyLabel: FAMILY_LABELS[tpl.family] ?? tpl.family,
    preview: tpl.render(PREVIEW_PROFILE),
    needs: tpl.needs,
  }));
}

/** Renderiza um modelo específico (escolhido na biblioteca "Ver modelos")
 * para `profile` real — null se o modelo não existir mais ou não for
 * compatível com os dados disponíveis da pessoa. */
export function renderTemplateByKey(key: string, profile: PersonProfile): GeneratedMessage | null {
  const index = Number(key);
  const tpl = Number.isInteger(index) ? TEMPLATES[index] : undefined;
  if (!tpl || !eligible(tpl, profile)) return null;
  return { text: tpl.render(profile), family: tpl.family, opening: tpl.opening, ending: tpl.ending };
}

/** Modelo customizado (gerenciado pelo administrador) — texto livre com
 * placeholders {{name}}/{{city}}/{{profession}}/{{organization}}/{{knownAs}}/
 * {{editorialPhrase}}/{{dateLabel}}, substituição literal (nunca template
 * engine/eval). Campos ausentes tornam o placeholder vazio. */
export interface CustomTemplate {
  id: string;
  family: string;
  body: string;
  needsCity: boolean;
  needsProfession: boolean;
  needsOrganization: boolean;
  needsKnownAs: boolean;
  needsEditorialPhrase: boolean;
}

export function customTemplateEligible(tpl: CustomTemplate, p: PersonProfile): boolean {
  if (tpl.needsCity && !p.city) return false;
  if (tpl.needsProfession && !p.profession) return false;
  if (tpl.needsOrganization && !(p.profession && p.organization)) return false;
  if (tpl.needsKnownAs && !p.knownAs) return false;
  if (tpl.needsEditorialPhrase && !p.editorialPhrase) return false;
  return true;
}

export function renderCustomTemplate(tpl: CustomTemplate, profile: PersonProfile): GeneratedMessage {
  const text = tpl.body
    .replaceAll("{{name}}", profile.name)
    .replaceAll("{{city}}", profile.city ?? "")
    .replaceAll("{{profession}}", profile.profession ?? "")
    .replaceAll("{{organization}}", profile.organization ?? "")
    .replaceAll("{{knownAs}}", profile.knownAs ?? "")
    .replaceAll("{{editorialPhrase}}", profile.editorialPhrase ?? "")
    .replaceAll("{{dateLabel}}", profile.dateLabel ?? "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { text, family: tpl.family || "custom", opening: "custom", ending: "custom" };
}
