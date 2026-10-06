import type { Client } from "@ir/types";

/** Dados de um novo cliente; id, reference, createdAt e updatedAt são atribuídos pelo provider. */
export type NewClientRecord = Omit<Client, "id" | "reference" | "createdAt" | "updatedAt">;

export type ClientChanges = Partial<Omit<Client, "id" | "reference" | "createdAt" | "updatedAt">>;

/** CPF ou CNPJ já cadastrado em outro cliente — nunca sobrescreve o existente. */
export class ClientDuplicateFieldError extends Error {
  constructor(public readonly field: "cpf" | "cnpj") {
    super(field === "cpf" ? "Já existe um cliente cadastrado com este CPF." : "Já existe um cliente cadastrado com este CNPJ.");
  }
}

/** CPF/CNPJ com dígito verificador inválido — barrada no próprio
 * ClientService (não só na validação de formulário), pra continuar valendo
 * mesmo se um módulo futuro chamar o service diretamente sem passar pela UI. */
export class ClientValidationError extends Error {}

export interface ClientRepository {
  list(): Promise<Client[]>;
  getById(id: string): Promise<Client | null>;
  create(record: NewClientRecord): Promise<Client>;
  update(id: string, changes: ClientChanges): Promise<Client>;
}
