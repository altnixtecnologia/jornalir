// Plano oficial de lotes (Fase 35, item 2). Padrão = 2 anos. Só dividir
// um lote específico (1 ano, depois semestre/mês) se ele apresentar
// problema grave — nunca por padrão.
export const BATCH_PLAN = [
  { key: "2015-2016", start: "2015-01-01", end: "2016-12-31" },
  { key: "2017-2018", start: "2017-01-01", end: "2018-12-31" },
  { key: "2019-2020", start: "2019-01-01", end: "2020-12-31" },
  { key: "2021-2022", start: "2021-01-01", end: "2022-12-31" },
  { key: "2023-2024", start: "2023-01-01", end: "2024-12-31" },
  { key: "2025-2026", start: "2025-01-01", end: "2026-12-31" },
];

// Ordem de prioridade determinística para escolher a editoria de uma
// matéria que apareceu em mais de uma categoria do legado (item 5) — a
// mesma matéria nunca gera duas linhas em `articles`.
export const CATEGORY_PRIORITY = [
  "geral",
  "esportes",
  "policia",
  "politica",
  "saude",
  "sociais",
  "agricultura",
  "classificados",
  "colunistas/roni_raupp",
  "colunistas/apae_de_sao_joao_do_sul",
  "colunistas/outras",
  "colunistas/informativo_contabil",
];

// Mapeamento legado -> editoria definitivo (item 3). Slugs conforme já
// existentes em editorial_sections (seed real + Fase 35 migration).
export const CATEGORY_TO_SECTION_SLUG = {
  geral: "geral",
  esportes: "esporte",
  policia: "policia",
  politica: "politica",
  saude: "saude",
  sociais: "sociais",
  agricultura: "agricultura",
  classificados: "classificados",
  "colunistas/roni_raupp": "colunistas",
  "colunistas/apae_de_sao_joao_do_sul": "colunistas",
  "colunistas/outras": "colunistas",
  "colunistas/informativo_contabil": "colunistas",
};

export function getBatch(key) {
  const batch = BATCH_PLAN.find((b) => b.key === key);
  if (!batch) throw new Error(`Lote desconhecido: ${key}. Lotes válidos: ${BATCH_PLAN.map((b) => b.key).join(", ")}`);
  return batch;
}
