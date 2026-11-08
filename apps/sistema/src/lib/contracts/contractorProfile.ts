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

/** Representante apresentado na escolha (sem CPF/poderes completos): só o que o operador precisa para decidir. */
export interface ContractorRepresentativeOption {
  id: string;
  fullName: string;
  roleTitle: string;
  representationRule: "individual" | "joint";
  powersValidUntil?: string;
  isDefault: boolean;
  /** Poderes ativos e dentro da vigência na data consultada. */
  validNow: boolean;
  /** Por que não vale hoje (inativo / fora da vigência). */
  reason?: string;
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
  /** Todos os representantes ativos, com a situação de vigência — alimenta a escolha de quem assina. */
  representatives: ContractorRepresentativeOption[];
  /**
   * Preenchido quando um representante foi ESCOLHIDO e não vale (removido,
   * inativo ou fora da vigência). Nunca há substituição silenciosa pelo
   * padrão: quem emite deve parar e quem escolhe deve ser avisado.
   */
  preferredInvalid?: string;
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

function formatIsoBr(iso: string): string {
  return iso.split("-").reverse().join("/");
}

/** Situação de um representante numa data: ativo e dentro da vigência dos poderes. */
export function evaluateRepresentative(rep: LegalRepresentativeRow, todayIso: string): { valid: boolean; reason?: string } {
  if (!rep.active) return { valid: false, reason: `${rep.full_name} está inativo.` };
  if (rep.powers_valid_from && todayIso < rep.powers_valid_from) {
    return { valid: false, reason: `Os poderes de ${rep.full_name} só valem a partir de ${formatIsoBr(rep.powers_valid_from)}.` };
  }
  if (rep.powers_valid_until && todayIso > rep.powers_valid_until) {
    return { valid: false, reason: `Os poderes de ${rep.full_name} expiraram em ${formatIsoBr(rep.powers_valid_until)}.` };
  }
  return { valid: true };
}

/**
 * Representante que assina pela CONTRATADA. Com `preferredId` (escolha do
 * operador) usa SÓ aquele — se não existir/estiver inativo/fora da vigência,
 * devolve `invalid` e NÃO cai no padrão. Sem escolha, usa o padrão ativo cujos
 * poderes valem em `todayIso`.
 */
export function pickContractRepresentative(
  representatives: LegalRepresentativeRow[],
  todayIso: string,
  preferredId?: string,
): { representative?: LegalRepresentativeRow; warnings: string[]; invalid?: string } {
  const warnings: string[] = [];
  if (preferredId) {
    const chosen = representatives.find((rep) => rep.id === preferredId);
    if (!chosen) {
      const message = "O representante escolhido para a contratada não está mais disponível. Escolha outro representante.";
      return { warnings: [message], invalid: message };
    }
    const status = evaluateRepresentative(chosen, todayIso);
    if (!status.valid) {
      const message = `${status.reason} Escolha outro representante.`;
      return { warnings: [message], invalid: message };
    }
    if (chosen.representation_rule === "joint") {
      warnings.push(`${chosen.full_name} representa a empresa em conjunto: o ato de assinar exigirá outro representante (etapa de assinatura).`);
    }
    return { representative: chosen, warnings };
  }
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

export function representativeOptions(representatives: LegalRepresentativeRow[], todayIso: string): ContractorRepresentativeOption[] {
  return representatives
    .filter((rep) => rep.active)
    .map((rep) => {
      const status = evaluateRepresentative(rep, todayIso);
      return {
        id: rep.id,
        fullName: rep.full_name,
        roleTitle: rep.role_title,
        representationRule: rep.representation_rule,
        powersValidUntil: rep.powers_valid_until ?? undefined,
        isDefault: rep.is_default,
        validNow: status.valid,
        reason: status.reason,
      };
    });
}

export function buildContractorProfile(
  company: CompanyProfileRow | null,
  representatives: LegalRepresentativeRow[],
  todayIso: string,
  preferredRepresentativeId?: string,
): ContractorProfile {
  const options = representativeOptions(representatives, todayIso);
  if (!company) {
    return {
      configured: false,
      variables: {},
      headerLines: ["[PENDENTE: cadastrar os dados da empresa em Configurações → Dados da empresa]"],
      warnings: ["Dados da empresa (CONTRATADA) não cadastrados em Configurações."],
      representatives: options,
    };
  }
  const { representative, warnings, invalid } = pickContractRepresentative(representatives, todayIso, preferredRepresentativeId);
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
    representatives: options,
    preferredInvalid: invalid,
  };
}

/** Linhas do bloco CONTRATANTE do cabeçalho — a partir dos campos já formatados do cadastro mestre (cliente.*). */
export function buildContracteeHeaderLines(values: Record<string, string>): string[] {
  const pick = (key: string, label: string): string => `${label}: ${values[key]?.trim() ? values[key].trim() : "[PENDENTE]"}`;
  const lines = [values["cliente.nome"]?.trim() || "[PENDENTE: nome do cliente]", `CPF/CNPJ: ${(values["cliente.cpf_cnpj"] ?? values["cliente.documento"] ?? "").trim() || "[PENDENTE]"}`, pick("cliente.endereco", "Endereço")];
  if (values["cliente.representante"]?.trim()) lines.push(`Representante: ${values["cliente.representante"].trim()}`);
  return lines;
}
