import type { ClientKind, ClientRole, ClientStatus } from "@ir/types";
import { isValidCnpj, isValidCpf, onlyDigits } from "@ir/core";

export interface ClientFormPayload {
  kind: ClientKind;
  status: ClientStatus;
  fullName: string;
  cpf: string;
  birthDate: string;
  companyName: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string;
  responsibleName: string;
  responsibleCpf: string;
  phonePrimary: string;
  phoneSecondary: string;
  whatsapp: string;
  email: string;
  addressZip: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressNeighborhood: string;
  addressCity: string;
  addressState: string;
  notes: string;
  roles: ClientRole[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mesma validação usada pela Server Action e pelo formulário — fonte
 * única, nunca duas regras divergentes (mesmo princípio de
 * validateArticlePayload). Retorna a primeira mensagem de erro ou null. */
export function validateClientPayload(payload: ClientFormPayload): string | null {
  if (payload.kind === "individual") {
    if (!payload.fullName.trim()) return "Informe o nome completo.";
    if (payload.cpf.trim() && !isValidCpf(payload.cpf)) return "CPF inválido.";
  } else {
    if (!payload.companyName.trim()) return "Informe a razão social.";
    if (payload.cnpj.trim() && !isValidCnpj(payload.cnpj)) return "CNPJ inválido.";
    if (payload.responsibleCpf.trim() && !isValidCpf(payload.responsibleCpf)) return "CPF do responsável inválido.";
  }
  if (payload.email.trim() && !EMAIL_RE.test(payload.email.trim())) return "E-mail inválido.";
  if (payload.addressState.trim() && onlyDigits(payload.addressState).length > 0) return "UF deve conter só letras.";
  return null;
}
