/**
 * Municípios brasileiros: apenas rótulos editoriais, sem ID fiscal.
 * As fontes de dados vêm da API pública de Localidades do IBGE.
 * Aceita formato nivelado e formato hierárquico para resistir a versões
 * do serviço; nunca inventa UF nem completa cidade sem seleção explícita.
 */
export interface IbgeMunicipality {
  nome?: unknown;
  "municipio-nome"?: unknown;
  "UF-sigla"?: unknown;
  microrregiao?: { mesorregiao?: { UF?: { sigla?: unknown } } };
  "regiao-imediata"?: {
    "regiao-intermediaria"?: { UF?: { sigla?: unknown } };
  };
}

export function ibgeMunicipalityLabel(item: IbgeMunicipality): string | null {
  const name = item.nome ?? item["municipio-nome"];
  if (typeof name !== "string" || !name.trim()) return null;
  const rawUF = item["UF-sigla"]
    ?? item.microrregiao?.mesorregiao?.UF?.sigla
    ?? item["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla;
  if (typeof rawUF !== "string" || !/^[A-Z]{2}$/.test(rawUF)) return null;
  return `${name.trim()} - ${rawUF}`;
}

export function municipalityLabels(rows: readonly IbgeMunicipality[]): string[] {
  return [...new Set(rows.map(ibgeMunicipalityLabel).filter((x): x is string => Boolean(x)))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function normalizeMunicipalitySearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").trim().replace(/\s+/g, " ");
}

/** Mostra primeiro nomes iniciados pelos caracteres digitados, depois ocorrências internas. */
export function matchMunicipalities(labels: readonly string[], search: string, limit = 9): string[] {
  const query = normalizeMunicipalitySearch(search);
  if (query.length < 2 || limit < 1) return [];
  const matching = labels.filter((label) => normalizeMunicipalitySearch(label).startsWith(query));
  if (matching.length >= limit) return matching.slice(0, limit);
  const rest = labels.filter((label) => {
    const normalized = normalizeMunicipalitySearch(label);
    return !normalized.startsWith(query) && normalized.includes(query);
  });
  return [...matching, ...rest].slice(0, limit);
}
