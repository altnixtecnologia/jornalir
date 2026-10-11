/**
 * Consulta de CEP via ViaCEP (API pública, sem chave, sem dependência nova).
 * Auditei o projeto antes de criar isto: não existia nenhum helper de CEP
 * em apps/sistema. `ibgeCode` só fica disponível no estado do formulário
 * em memória — `clients` (cadastro mestre) não tem coluna para isso hoje;
 * nunca persistir esse valor sem migration futura.
 */
export interface CepLookupResult {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  ibgeCode: string;
}

interface ViaCepResponse {
  // A API retorna a string "true" (não booleano) quando o CEP não existe —
  // confirmado em teste real; o `if (data.erro)` funciona nos dois casos.
  erro?: boolean | string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
}

/** Retorna null quando o CEP é inválido/inexistente (nunca lança nesse caso). */
export async function lookupCep(cepDigits: string, signal?: AbortSignal): Promise<CepLookupResult | null> {
  if (cepDigits.length !== 8) return null;
  const response = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`, { signal });
  if (!response.ok) throw new Error("Falha ao consultar CEP.");
  const data = (await response.json()) as ViaCepResponse;
  if (data.erro) return null;
  return {
    street: data.logradouro ?? "",
    neighborhood: data.bairro ?? "",
    city: data.localidade ?? "",
    state: data.uf ?? "",
    ibgeCode: data.ibge ?? "",
  };
}
