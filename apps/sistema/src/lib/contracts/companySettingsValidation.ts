import { isValidCnpj, isValidCpf, onlyDigits } from "@ir/core";

/**
 * Validação dos dados da CONTRATADA (Jornal IR) e do representante legal.
 * Puro e testável; as mesmas regras existem como CHECK no banco
 * (20261122150000), que é a barreira final.
 */

export interface CompanyProfileInput {
  legalName: string;
  tradeName?: string;
  cnpj: string;
  stateRegistration?: string;
  municipalRegistration?: string;
  addressStreet: string;
  addressNumber?: string;
  addressComplement?: string;
  addressDistrict?: string;
  addressCity: string;
  addressState: string;
  addressZip?: string;
  email?: string;
  phone?: string;
  website?: string;
}

export interface LegalRepresentativeInput {
  fullName: string;
  cpf: string;
  roleTitle: string;
  nationality?: string;
  email?: string;
  phone?: string;
  representationRule: "individual" | "joint";
  powersDescription: string;
  powersEvidenceNote?: string;
  powersValidFrom?: string;
  powersValidUntil?: string;
  isDefault: boolean;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UF_RE = /^[A-Z]{2}$/;

function text(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
function optional(value: string | undefined, max: number, field: string, errors: Record<string, string>): string | undefined {
  const cleaned = text(value);
  if (!cleaned) return undefined;
  if (cleaned.length > max) errors[field] = `Máximo de ${max} caracteres.`;
  return cleaned;
}
function validDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function validateCompanyProfile(input: CompanyProfileInput): ValidationResult<CompanyProfileInput> {
  const errors: Record<string, string> = {};
  const legalName = text(input.legalName);
  if (legalName.length < 3 || legalName.length > 200) errors.legalName = "Informe a razão social (3 a 200 caracteres).";
  const cnpj = onlyDigits(input.cnpj);
  if (!isValidCnpj(cnpj)) errors.cnpj = "CNPJ inválido.";
  const addressStreet = text(input.addressStreet);
  if (addressStreet.length < 3 || addressStreet.length > 200) errors.addressStreet = "Informe o logradouro.";
  const addressCity = text(input.addressCity);
  if (addressCity.length < 2 || addressCity.length > 100) errors.addressCity = "Informe a cidade.";
  const addressState = text(input.addressState).toUpperCase();
  if (!UF_RE.test(addressState)) errors.addressState = "Informe a UF com 2 letras.";
  const zipDigits = onlyDigits(input.addressZip);
  if (text(input.addressZip) && zipDigits.length !== 8) errors.addressZip = "CEP deve ter 8 dígitos.";
  const email = text(input.email);
  if (email && !EMAIL_RE.test(email)) errors.email = "E-mail inválido.";

  const value: CompanyProfileInput = {
    legalName,
    tradeName: optional(input.tradeName, 200, "tradeName", errors),
    cnpj,
    stateRegistration: optional(input.stateRegistration, 40, "stateRegistration", errors),
    municipalRegistration: optional(input.municipalRegistration, 40, "municipalRegistration", errors),
    addressStreet,
    addressNumber: optional(input.addressNumber, 20, "addressNumber", errors),
    addressComplement: optional(input.addressComplement, 100, "addressComplement", errors),
    addressDistrict: optional(input.addressDistrict, 100, "addressDistrict", errors),
    addressCity,
    addressState,
    addressZip: zipDigits || undefined,
    email: email || undefined,
    phone: optional(input.phone, 30, "phone", errors),
    website: optional(input.website, 200, "website", errors),
  };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export function validateLegalRepresentative(input: LegalRepresentativeInput): ValidationResult<LegalRepresentativeInput> {
  const errors: Record<string, string> = {};
  const fullName = text(input.fullName);
  if (fullName.length < 3 || fullName.length > 200) errors.fullName = "Informe o nome completo.";
  const cpf = onlyDigits(input.cpf);
  if (!isValidCpf(cpf)) errors.cpf = "CPF inválido.";
  const roleTitle = text(input.roleTitle);
  if (roleTitle.length < 2 || roleTitle.length > 120) errors.roleTitle = "Informe o cargo/qualificação.";
  const powersDescription = text(input.powersDescription);
  if (powersDescription.length < 10 || powersDescription.length > 1000) {
    errors.powersDescription = "Descreva os poderes de representação (mínimo 10 caracteres).";
  }
  if (input.representationRule !== "individual" && input.representationRule !== "joint") {
    errors.representationRule = "Regra de representação inválida.";
  }
  const email = text(input.email);
  if (email && !EMAIL_RE.test(email)) errors.email = "E-mail inválido.";
  const from = text(input.powersValidFrom);
  const until = text(input.powersValidUntil);
  if (from && !validDate(from)) errors.powersValidFrom = "Data inválida.";
  if (until && !validDate(until)) errors.powersValidUntil = "Data inválida.";
  if (from && until && !errors.powersValidFrom && !errors.powersValidUntil && until < from) {
    errors.powersValidUntil = "O fim da vigência dos poderes não pode ser anterior ao início.";
  }

  const value: LegalRepresentativeInput = {
    fullName,
    cpf,
    roleTitle,
    nationality: optional(input.nationality, 60, "nationality", errors),
    email: email || undefined,
    phone: optional(input.phone, 30, "phone", errors),
    representationRule: input.representationRule,
    powersDescription,
    powersEvidenceNote: optional(input.powersEvidenceNote, 500, "powersEvidenceNote", errors),
    powersValidFrom: from || undefined,
    powersValidUntil: until || undefined,
    isDefault: input.isDefault === true,
  };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/** Os poderes só valem dentro da vigência informada (usado na Etapa 2/3 ao escolher o representante). */
export function representativePowersValidOn(
  rep: Pick<LegalRepresentativeInput, "powersValidFrom" | "powersValidUntil">,
  isoDate: string,
): boolean {
  if (rep.powersValidFrom && isoDate < rep.powersValidFrom) return false;
  if (rep.powersValidUntil && isoDate > rep.powersValidUntil) return false;
  return true;
}
