import type { NfseServiceProfile } from "@ir/types";
import {
  ServiceProfileValidationError,
  type ServiceProfileChanges,
  type ServiceProfileListQuery,
  type ServiceProfileRepository,
} from "./service-profile-repository";

export class ServiceProfileNotFoundError extends Error {
  constructor(id: string) {
    super(`Perfil de serviço não encontrado: ${id}`);
  }
}

export interface ServiceProfileInput {
  name: string;
  active?: boolean;
  cTribNac?: string;
  cTribMun?: string;
  cNBS?: string;
  defaultLocationMunicipality?: string;
  defaultLocationIbgeCode?: string;
  issqnTaxation?: string;
  issqnRate?: number;
  specialTaxRegime?: string;
  notes?: string;
}

function trimOrUndefined(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalize(input: ServiceProfileInput) {
  return {
    name: input.name.trim(),
    active: input.active ?? true,
    cTribNac: trimOrUndefined(input.cTribNac),
    cTribMun: trimOrUndefined(input.cTribMun),
    cNBS: trimOrUndefined(input.cNBS),
    defaultLocationMunicipality: trimOrUndefined(input.defaultLocationMunicipality),
    defaultLocationIbgeCode: trimOrUndefined(input.defaultLocationIbgeCode),
    issqnTaxation: trimOrUndefined(input.issqnTaxation),
    issqnRate: input.issqnRate !== undefined && Number.isFinite(input.issqnRate) ? input.issqnRate : undefined,
    specialTaxRegime: trimOrUndefined(input.specialTaxRegime),
    notes: trimOrUndefined(input.notes),
  };
}

/**
 * Perfis de serviço (Parte 1, item 5) — evita preencher toda a
 * configuração fiscal manualmente em cada emissão. Nenhum seed de
 * código fiscal: todo perfil nasce com os campos fiscais vazios, o
 * usuário preenche o que for aplicável. Nunca excluído — só
 * desativado (`deactivate`), mesmo depois de usado em rascunhos.
 */
export class ServiceProfileService {
  constructor(private readonly profiles: ServiceProfileRepository) {}

  list(query?: ServiceProfileListQuery): Promise<NfseServiceProfile[]> {
    return this.profiles.list(query);
  }

  async getById(id: string): Promise<NfseServiceProfile> {
    const profile = await this.profiles.getById(id);
    if (!profile) throw new ServiceProfileNotFoundError(id);
    return profile;
  }

  register(input: ServiceProfileInput): Promise<NfseServiceProfile> {
    const record = normalize(input);
    if (!record.name) throw new ServiceProfileValidationError("Informe um nome amigável para o perfil.");
    return this.profiles.create(record);
  }

  async update(id: string, input: ServiceProfileInput): Promise<NfseServiceProfile> {
    await this.getById(id);
    const record = normalize(input);
    if (!record.name) throw new ServiceProfileValidationError("Informe um nome amigável para o perfil.");
    return this.profiles.update(id, record);
  }

  /** "Excluir" um perfil é sempre isto — nunca uma remoção real da linha (item 5). */
  async deactivate(id: string): Promise<NfseServiceProfile> {
    await this.getById(id);
    return this.profiles.update(id, { active: false } as ServiceProfileChanges);
  }

  async reactivate(id: string): Promise<NfseServiceProfile> {
    await this.getById(id);
    return this.profiles.update(id, { active: true } as ServiceProfileChanges);
  }
}
