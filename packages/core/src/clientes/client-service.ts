import type { Client, ClientAddress, ClientKind, ClientRole, ClientStatus } from "@ir/types";
import { ClientValidationError, type ClientChanges, type ClientRepository, type NewClientRecord } from "./client-repository";
import { isValidCnpj, isValidCpf, normalizeCnpj, onlyDigits } from "./client-validation";

export class ClientNotFoundError extends Error {
  constructor(id: string) {
    super(`Cliente não encontrado: ${id}`);
  }
}

export interface ClientInput {
  kind: ClientKind;
  status?: ClientStatus;
  fullName?: string;
  cpf?: string;
  birthDate?: string;
  companyName?: string;
  tradeName?: string;
  cnpj?: string;
  stateRegistration?: string;
  responsibleName?: string;
  responsibleCpf?: string;
  foundingDate?: string;
  phonePrimary?: string;
  phoneSecondary?: string;
  whatsapp?: string;
  email?: string;
  fiscalEmail?: string;
  municipalRegistration?: string;
  addressIbgeCode?: string;
  icmsStatus?: "contribuinte" | "isento" | "nao_contribuinte";
  address?: ClientAddress;
  notes?: string;
  roles?: ClientRole[];
}

function trimOrUndefined(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeAddress(address: ClientAddress | undefined): ClientAddress {
  return {
    zip: trimOrUndefined(address?.zip),
    street: trimOrUndefined(address?.street),
    number: trimOrUndefined(address?.number),
    complement: trimOrUndefined(address?.complement),
    neighborhood: trimOrUndefined(address?.neighborhood),
    city: trimOrUndefined(address?.city),
    state: address?.state?.trim().toUpperCase().slice(0, 2) || undefined,
  };
}

/** Normaliza o input comum às duas direções (create/update) — nunca grava
 * campo do tipo errado (ex.: companyName numa pessoa física) mesmo que o
 * formulário envie por engano. */
function normalizeFields(input: ClientInput): Omit<NewClientRecord, "status" | "roles"> & { status: ClientStatus; roles: ClientRole[] } {
  const isIndividual = input.kind === "individual";
  return {
    kind: input.kind,
    status: input.status ?? "active",
    fullName: isIndividual ? trimOrUndefined(input.fullName) : undefined,
    cpf: isIndividual ? onlyDigits(input.cpf) || undefined : undefined,
    birthDate: isIndividual ? input.birthDate || undefined : undefined,
    companyName: isIndividual ? undefined : trimOrUndefined(input.companyName),
    tradeName: isIndividual ? undefined : trimOrUndefined(input.tradeName),
    cnpj: isIndividual ? undefined : normalizeCnpj(input.cnpj) || undefined,
    stateRegistration: isIndividual ? undefined : trimOrUndefined(input.stateRegistration),
    responsibleName: isIndividual ? undefined : trimOrUndefined(input.responsibleName),
    responsibleCpf: isIndividual ? undefined : onlyDigits(input.responsibleCpf) || undefined,
    foundingDate: isIndividual ? undefined : input.foundingDate || undefined,
    phonePrimary: onlyDigits(input.phonePrimary) || undefined,
    phoneSecondary: onlyDigits(input.phoneSecondary) || undefined,
    whatsapp: onlyDigits(input.whatsapp) || undefined,
    email: trimOrUndefined(input.email)?.toLowerCase(),
    fiscalEmail: trimOrUndefined(input.fiscalEmail)?.toLowerCase(),
    municipalRegistration: isIndividual ? undefined : trimOrUndefined(input.municipalRegistration),
    addressIbgeCode: onlyDigits(input.addressIbgeCode) || undefined,
    icmsStatus: isIndividual ? undefined : input.icmsStatus || undefined,
    address: normalizeAddress(input.address),
    notes: trimOrUndefined(input.notes),
    roles: input.roles ?? [],
  };
}

/** Barreira de validação no próprio domínio (não só na UI/Server Action) —
 * CPF/CNPJ com dígito verificador inválido nunca chega ao repositório,
 * mesmo que ClientService seja chamado diretamente por outro módulo futuro
 * sem passar pela validação de formulário. Campo vazio é válido (opcional);
 * só um valor PREENCHIDO com checksum errado é rejeitado. */
function assertValidDocuments(record: Pick<NewClientRecord, "kind" | "cpf" | "cnpj" | "responsibleCpf">): void {
  if (record.kind === "individual") {
    if (record.cpf && !isValidCpf(record.cpf)) throw new ClientValidationError("CPF inválido.");
  } else {
    if (record.cnpj && !isValidCnpj(record.cnpj)) throw new ClientValidationError("CNPJ inválido.");
    if (record.responsibleCpf && !isValidCpf(record.responsibleCpf)) throw new ClientValidationError("CPF do responsável inválido.");
  }
}

/** Proteção fiscal para outros consumidores do ClientService, mesmo sem formulário. */
function assertValidFiscalFields(record: ClientChanges): void {
  if (record.addressIbgeCode && !/^[0-9]{7}$/.test(record.addressIbgeCode)) {
    throw new ClientValidationError("Código IBGE do município inválido.");
  }
  if (record.fiscalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.fiscalEmail)) {
    throw new ClientValidationError("E-mail fiscal inválido.");
  }
  if (record.icmsStatus && !["contribuinte", "isento", "nao_contribuinte"].includes(record.icmsStatus)) {
    throw new ClientValidationError("Situação ICMS inválida.");
  }
}

/** Cadastro central de clientes (Fase 1) — só identidade e contato.
 * Proteção contra duplicidade real (CPF/CNPJ) é enforced pelo banco
 * (índice único parcial); este service normaliza os dados ANTES de
 * chegarem lá, pra a comparação de duplicidade ser sempre sobre o mesmo
 * formato (só dígitos), e valida o checksum ANTES de chamar o repositório
 * (defesa em profundidade — nunca confia só na validação de formulário). */
export class ClientService {
  constructor(private readonly clients: ClientRepository) {}

  list(): Promise<Client[]> {
    return this.clients.list();
  }

  async getById(id: string): Promise<Client> {
    const client = await this.clients.getById(id);
    if (!client) throw new ClientNotFoundError(id);
    return client;
  }

  register(input: ClientInput): Promise<Client> {
    const record: NewClientRecord = normalizeFields(input);
    assertValidDocuments(record);
    assertValidFiscalFields(record);
    return this.clients.create(record);
  }

  async update(id: string, input: ClientInput): Promise<Client> {
    await this.getById(id);
    const changes: ClientChanges = normalizeFields(input);
    assertValidDocuments(changes as Pick<NewClientRecord, "kind" | "cpf" | "cnpj" | "responsibleCpf">);
    assertValidFiscalFields(changes);
    return this.clients.update(id, changes);
  }
}
