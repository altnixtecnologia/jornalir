import type { Client, ClientAddress, ClientKind, ClientRole, ClientStatus } from "@ir/types";
import type { ClientChanges, ClientRepository, NewClientRecord } from "./client-repository";
import { onlyDigits } from "./client-validation";

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
  phonePrimary?: string;
  phoneSecondary?: string;
  whatsapp?: string;
  email?: string;
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
    cnpj: isIndividual ? undefined : onlyDigits(input.cnpj) || undefined,
    stateRegistration: isIndividual ? undefined : trimOrUndefined(input.stateRegistration),
    responsibleName: isIndividual ? undefined : trimOrUndefined(input.responsibleName),
    responsibleCpf: isIndividual ? undefined : onlyDigits(input.responsibleCpf) || undefined,
    phonePrimary: onlyDigits(input.phonePrimary) || undefined,
    phoneSecondary: onlyDigits(input.phoneSecondary) || undefined,
    whatsapp: onlyDigits(input.whatsapp) || undefined,
    email: trimOrUndefined(input.email)?.toLowerCase(),
    address: normalizeAddress(input.address),
    notes: trimOrUndefined(input.notes),
    roles: input.roles ?? [],
  };
}

/** Cadastro central de clientes (Fase 1) — só identidade e contato.
 * Proteção contra duplicidade real (CPF/CNPJ) é enforced pelo banco
 * (índice único parcial); este service normaliza os dados ANTES de
 * chegarem lá, pra a comparação de duplicidade ser sempre sobre o mesmo
 * formato (só dígitos). */
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
    return this.clients.create(record);
  }

  async update(id: string, input: ClientInput): Promise<Client> {
    await this.getById(id);
    const changes: ClientChanges = normalizeFields(input);
    return this.clients.update(id, changes);
  }
}
