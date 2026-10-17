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
  /** Data de fundação — só exibida/enviada para kind "company" (ver clients_founding_date_only_company). Nunca confundida com birthDate (exclusivo de pessoa física). */
  foundingDate: string;
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
 * validateArticlePayload). Retorna a primeira mensagem de erro ou null.
 *
 * Regras obrigatórias (padronização de Cadastros): Nome/Razão social,
 * CPF/CNPJ, WhatsApp, e-mail e ao menos um papel — para os dois tipos de
 * cadastro. */
export function validateClientPayload(payload: ClientFormPayload): string | null {
  if (payload.kind === "individual") {
    if (!payload.fullName.trim()) return "Informe o nome completo.";
    if (!payload.cpf.trim()) return "Informe o CPF.";
    if (!isValidCpf(payload.cpf)) return "CPF inválido.";
  } else {
    if (!payload.companyName.trim()) return "Informe a razão social.";
    if (!payload.cnpj.trim()) return "Informe o CNPJ.";
    if (!isValidCnpj(payload.cnpj)) return "CNPJ inválido.";
    if (payload.responsibleCpf.trim() && !isValidCpf(payload.responsibleCpf)) return "CPF do responsável inválido.";
  }
  if (!payload.whatsapp.trim()) return "Informe o WhatsApp.";
  if (!payload.email.trim()) return "Informe o e-mail de contato.";
  if (!EMAIL_RE.test(payload.email.trim())) return "E-mail inválido.";
  if (payload.addressState.trim() && onlyDigits(payload.addressState).length > 0) return "UF deve conter só letras.";
  if (payload.roles.length === 0) return "Selecione ao menos um papel.";
  return null;
}
