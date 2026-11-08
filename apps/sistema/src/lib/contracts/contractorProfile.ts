/**
 * CONTRATADA (Jornal IR) a partir das configurações da Etapa 1
 * (`company_profile` + `company_legal_representatives`). Puro e testável: o
 * carregamento do banco fica em `contractorProfileLoader.ts`. Nunca presume
 * CNPJ/endereço/poderes: o que faltar vira pendência explícita, e os poderes
 * do representante só valem dentro da vigência cadastrada.
 */

export interface CompanyProfileRow {
  legal_name: string;
  trade_name: string | null;
  cnpj: string;
  address_street: string;
  address_number: string | null;
  address_complement: string | null;
  address_district: string | null;
  address_city: string;
  address_state: string;
  address_zip: string | null;
  email: string | null;
  phone: string | null;
}

export interface LegalRepresentativeRow {
  id: string;
  full_name: string;
  cpf: string;
  role_title: string;
  nationality: string | null;
  representation_rule: "individual" | "joint";
  powers_description: string;
  powers_valid_from: string | null;
  powers_valid_until: string | null;
  active: boolean;
  is_default: boolean;
}

export interface ContractorProfile {
  /** Há dados da empresa cadastrados. Sem isso, o chamador mantém o fluxo anterior (valores digitados). */
  configured: boolean;
  /** Variáveis `contratada.*` — só as que existem; nunca vazias. */
  variables: Record<string, string>;
  /** Linhas do bloco CONTRATADA do cabeçalho do PDF. */
  headerLines: string[];
  warnings: string[];
  representativeId?: string;
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatCnpjDisplay(value: string): string {
  const d = digits(value);
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : value;
}

export function formatCpfDisplay(value: string): string {
  const d = digits(value);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : value;
}

function formatCompanyAddress(company: CompanyProfileRow): string {
  const line1 = [company.address_street, company.address_number].filter(Boolean).join(", ");
  const line2 = [company.address_district, `${company.address_city}/${company.address_state}`].filter(Boolean).join(" - ");
  const zip = company.address_zip && digits(company.address_zip).length === 8
    ? `CEP ${digits(company.address_zip).replace(/(\d{5})(\d{3})/, "$1-$2")}`
    : "";
  return [line1, company.address_complement, line2, zip].filter(Boolean).join(", ");
}

/** Padrão ativo cujos poderes valem em `todayIso`; fora da vigência não é usado (e gera aviso). */
export function pickContractRepresentative(
  representatives: LegalRepresentativeRow[],
  todayIso: string,
): { representative?: LegalRepresentativeRow; warnings: string[] } {
  const warnings: string[] = [];
  const active = representatives.filter((rep) => rep.active);
  const preferred = active.find((rep) => rep.is_default) ?? (active.length === 1 ? active[0] : undefined);
  if (!preferred) {
    warnings.push(
      active.length === 0
        ? "Nenhum representante legal ativo cadastrado em Configurações → Dados da empresa."
        : "Defina o representante legal padrão em Configurações → Dados da empresa.",
    );
    return { warnings };
  }
  if (preferred.powers_valid_from && todayIso < preferred.powers_valid_from) {
    warnings.push(`Os poderes de ${preferred.full_name} só valem a partir de ${preferred.powers_valid_from.split("-").reverse().join("/")}.`);
    return { warnings };
  }
  if (preferred.powers_valid_until && todayIso > preferred.powers_valid_until) {
    warnings.push(`Os poderes de ${preferred.full_name} expiraram em ${preferred.powers_valid_until.split("-").reverse().join("/")}.`);
    return { warnings };
  }
  if (preferred.representation_rule === "joint") {
    warnings.push(`${preferred.full_name} representa a empresa em conjunto: o ato de assinar exigirá outro representante (etapa de assinatura).`);
  }
  return { representative: preferred, warnings };
}

export function buildContractorProfile(
  company: CompanyProfileRow | null,
  representatives: LegalRepresentativeRow[],
  todayIso: string,
): ContractorProfile {
  if (!company) {
    return {
      configured: false,
      variables: {},
      headerLines: ["[PENDENTE: cadastrar os dados da empresa em Configurações → Dados da empresa]"],
      warnings: ["Dados da empresa (CONTRATADA) não cadastrados em Configurações."],
    };
  }
  const { representative, warnings } = pickContractRepresentative(representatives, todayIso);
  const address = formatCompanyAddress(company);
  const representativeText = representative
    ? [
        representative.full_name,
        representative.nationality,
        `CPF ${formatCpfDisplay(representative.cpf)}`,
        representative.role_title,
      ].filter(Boolean).join(", ")
    : "";

  const variables: Record<string, string> = {
    "contratada.razao_social": company.legal_name,
    "contratada.cnpj": formatCnpjDisplay(company.cnpj),
    "contratada.endereco": address,
  };
  if (company.trade_name) variables["contratada.nome_fantasia"] = company.trade_name;
  if (company.email) variables["contratada.email"] = company.email;
  if (company.phone) variables["contratada.telefone"] = company.phone;
  if (representativeText) variables["contratada.representante"] = representativeText;

  return {
    configured: true,
    variables,
    headerLines: [
      company.legal_name,
      `CNPJ ${formatCnpjDisplay(company.cnpj)}`,
      address,
      representativeText ? `Representante legal: ${representativeText}` : "Representante legal: [PENDENTE]",
    ],
    warnings,
    representativeId: representative?.id,
  };
}

/** Linhas do bloco CONTRATANTE do cabeçalho — a partir dos campos já formatados do cadastro mestre (cliente.*). */
export function buildContracteeHeaderLines(values: Record<string, string>): string[] {
  const pick = (key: string, label: string): string => `${label}: ${values[key]?.trim() ? values[key].trim() : "[PENDENTE]"}`;
  const lines = [values["cliente.nome"]?.trim() || "[PENDENTE: nome do cliente]", `CPF/CNPJ: ${(values["cliente.cpf_cnpj"] ?? values["cliente.documento"] ?? "").trim() || "[PENDENTE]"}`, pick("cliente.endereco", "Endereço")];
  if (values["cliente.representante"]?.trim()) lines.push(`Representante: ${values["cliente.representante"].trim()}`);
  return lines;
}
