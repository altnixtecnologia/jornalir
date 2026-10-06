import type { ClientKind, NfseDraft, NfseFiscalSnapshot, NfseTomadorSnapshot } from "@ir/types";
import { isValidCnpj, isValidCpf } from "../clientes/client-validation";
import { DraftValidationError, type DraftChanges, type DraftListQuery, type DraftRepository, type NewDraftRecord } from "./draft-repository";

export class DraftNotFoundError extends Error {
  constructor(id: string) {
    super(`Rascunho de NFS-e não encontrado: ${id}`);
  }
}

export interface DraftInput {
  clientId: string;
  tomador: NfseTomadorSnapshot;
  serviceProfileId?: string;
  fiscal: NfseFiscalSnapshot;
  competencyDate: string;
  serviceValue: number;
  serviceDescription: string;
  notes?: string;
}

export interface DraftValidationResult {
  readyForFutureTransmission: boolean;
  missingFields: string[];
}

function trimOrUndefined(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalize(input: DraftInput): NewDraftRecord {
  return {
    clientId: input.clientId,
    tomador: { ...input.tomador, name: input.tomador.name.trim() },
    serviceProfileId: trimOrUndefined(input.serviceProfileId),
    fiscal: { ...input.fiscal },
    competencyDate: input.competencyDate,
    serviceValue: input.serviceValue,
    serviceDescription: input.serviceDescription.trim(),
    notes: trimOrUndefined(input.notes),
    status: "draft",
  };
}

function assertValid(record: Pick<NewDraftRecord, "clientId" | "competencyDate" | "serviceValue" | "serviceDescription">): void {
  if (!record.clientId) throw new DraftValidationError("Selecione o cliente/tomador.");
  if (!record.competencyDate) throw new DraftValidationError("Informe a competência.");
  if (!Number.isFinite(record.serviceValue) || record.serviceValue <= 0) throw new DraftValidationError("Informe um valor de serviço maior que zero.");
  if (!record.serviceDescription) throw new DraftValidationError("Informe a descrição do serviço.");
}

/**
 * Validação INTERNA de pré-emissão (Parte 1, item 10) — nunca declara
 * o rascunho "fiscalmente válido perante a Receita/Governo". Só
 * confirma que os dados mínimos pra uma futura transmissão (Parte 2)
 * estão preenchidos. CPF/CNPJ validados com os MESMOS utilitários já
 * usados em Clientes (isValidCpf/isValidCnpj) — nunca reimplementados.
 */
export function validateNfseDraft(input: {
  clientId?: string;
  tomadorKind?: ClientKind;
  tomadorName?: string;
  tomadorCpf?: string;
  tomadorCnpj?: string;
  tomadorCity?: string;
  tomadorState?: string;
  serviceProfileId?: string;
  cTribNac?: string;
  competencyDate?: string;
  serviceValue?: number;
  serviceDescription?: string;
  issuerConfigured: boolean;
}): DraftValidationResult {
  const missing: string[] = [];

  if (!input.clientId) missing.push("Cliente");
  if (!input.tomadorName || !input.tomadorName.trim()) missing.push("Nome/razão social do tomador");

  if (input.tomadorKind === "individual") {
    if (!isValidCpf(input.tomadorCpf)) missing.push("CPF do tomador válido");
  } else if (input.tomadorKind === "company") {
    if (!isValidCnpj(input.tomadorCnpj)) missing.push("CNPJ do tomador válido");
  } else {
    missing.push("Tipo de tomador (pessoa física/jurídica)");
  }

  if (!input.tomadorCity || !input.tomadorCity.trim()) missing.push("Município do tomador");
  if (!input.tomadorState || !input.tomadorState.trim()) missing.push("UF do tomador");
  if (!input.serviceProfileId) missing.push("Perfil de serviço");
  if (!input.cTribNac || !input.cTribNac.trim()) missing.push("Código de tributação nacional (cTribNac)");
  if (!input.competencyDate) missing.push("Competência");
  if (input.serviceValue === undefined || !Number.isFinite(input.serviceValue) || input.serviceValue <= 0) {
    missing.push("Valor do serviço (maior que zero)");
  }
  if (!input.serviceDescription || !input.serviceDescription.trim()) missing.push("Descrição do serviço");
  if (!input.issuerConfigured) missing.push("Configuração fiscal do prestador");

  return { readyForFutureTransmission: missing.length === 0, missingFields: missing };
}

/**
 * Rascunhos de NFS-e (Parte 1, item 8/9) — a NFS-e é independente de
 * Contrato/Assinatura/Financeiro (ver docs/NFSE-NACIONAL-ARQUITETURA.md).
 * `tomador`/`fiscal` são sempre SNAPSHOTS (ver buildTomadorSnapshotFromClient/
 * buildFiscalSnapshotFromServiceProfile em @ir/types) — editar um
 * rascunho aqui NUNCA altera o Client/NfseServiceProfile de origem;
 * só uma ação explícita de sincronização (fora deste service, ver
 * composition/actions) escreve de volta no cadastro mestre. Status
 * nesta fase é sempre "draft" — nenhum estado de autorização inventado.
 */
export class DraftService {
  constructor(private readonly drafts: DraftRepository) {}

  list(query?: DraftListQuery): Promise<NfseDraft[]> {
    return this.drafts.list(query);
  }

  async getById(id: string): Promise<NfseDraft> {
    const draft = await this.drafts.getById(id);
    if (!draft) throw new DraftNotFoundError(id);
    return draft;
  }

  register(input: DraftInput): Promise<NfseDraft> {
    const record = normalize(input);
    assertValid(record);
    return this.drafts.create(record);
  }

  async update(id: string, input: DraftInput): Promise<NfseDraft> {
    await this.getById(id);
    const record = normalize(input) as DraftChanges;
    assertValid(record as Pick<NewDraftRecord, "clientId" | "competencyDate" | "serviceValue" | "serviceDescription">);
    return this.drafts.update(id, record);
  }

  async validate(id: string, issuerConfigured: boolean): Promise<DraftValidationResult> {
    const draft = await this.getById(id);
    return validateNfseDraft({
      clientId: draft.clientId,
      tomadorKind: draft.tomador.kind,
      tomadorName: draft.tomador.name,
      tomadorCpf: draft.tomador.cpf,
      tomadorCnpj: draft.tomador.cnpj,
      tomadorCity: draft.tomador.city,
      tomadorState: draft.tomador.state,
      serviceProfileId: draft.serviceProfileId,
      cTribNac: draft.fiscal.cTribNac,
      competencyDate: draft.competencyDate,
      serviceValue: draft.serviceValue,
      serviceDescription: draft.serviceDescription,
      issuerConfigured,
    });
  }
}
