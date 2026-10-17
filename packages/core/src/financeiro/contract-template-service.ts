import type { ContractTemplate, ContractTemplateVariable } from "@ir/types";
import { ContractTemplateNotFoundError, type ContractTemplateRepository } from "./contract-template-repository";

export class ContractTemplateValidationError extends Error {}

export interface ContractTemplateInput {
  title: string;
  description?: string;
  category?: string;
  content: string;
  variables: ContractTemplateVariable[];
}

const VARIABLE_KEY_RE = /^[a-z][a-z0-9_]{1,59}$/;

function validate(input: ContractTemplateInput): void {
  if (!input.title.trim() || input.title.trim().length < 3) {
    throw new ContractTemplateValidationError("Informe um título com pelo menos 3 caracteres.");
  }
  if (!input.content.trim()) {
    throw new ContractTemplateValidationError("O conteúdo do modelo não pode estar vazio.");
  }
  const seenKeys = new Set<string>();
  for (const variable of input.variables) {
    if (!VARIABLE_KEY_RE.test(variable.key)) {
      throw new ContractTemplateValidationError(`Chave de campo variável inválida: "${variable.key}" (use letras minúsculas, números e _).`);
    }
    if (seenKeys.has(variable.key)) {
      throw new ContractTemplateValidationError(`Campo variável duplicado: "${variable.key}".`);
    }
    seenKeys.add(variable.key);
    if (!variable.label.trim()) {
      throw new ContractTemplateValidationError(`Informe um rótulo para o campo "${variable.key}".`);
    }
  }
}

function toRecord(input: ContractTemplateInput) {
  return {
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    category: input.category?.trim() || undefined,
    content: input.content,
    variables: input.variables,
  };
}

/**
 * Modelos de contrato (Item 5, Lote 3) — gerencia criação, edição
 * (sempre uma versão nova, nunca sobrescreve), duplicação (grupo
 * novo) e ativação/desativação. `createdByProfileId` nunca é
 * recebido por parâmetro (mesmo princípio de addAmendment/addDocument
 * — o autor real vem da sessão autenticada, nunca de um valor
 * confiado vindo do chamador). NUNCA gera PDF (ver
 * apps/sistema/src/lib/contracts/contractTemplatePdf.ts, server-only,
 * fora de packages/core de propósito, mesmo princípio dos módulos
 * NFS-e Node-only).
 */
export class ContractTemplateService {
  constructor(private readonly templates: ContractTemplateRepository) {}

  listCurrentVersions(): Promise<ContractTemplate[]> {
    return this.templates.listCurrentVersions();
  }

  async getById(id: string): Promise<ContractTemplate> {
    const template = await this.templates.getById(id);
    if (!template) throw new ContractTemplateNotFoundError(`Modelo de contrato não encontrado: ${id}`);
    return template;
  }

  listVersionHistory(groupId: string): Promise<ContractTemplate[]> {
    return this.templates.listVersionsByGroup(groupId);
  }

  async create(input: ContractTemplateInput): Promise<ContractTemplate> {
    validate(input);
    return this.templates.createFirstVersion(toRecord(input));
  }

  /** "Editar" — sempre cria uma versão NOVA no mesmo grupo; a versão anterior nunca é alterada. */
  async createNewVersion(groupId: string, input: ContractTemplateInput): Promise<ContractTemplate> {
    validate(input);
    const current = await this.templates.getLatestVersionByGroup(groupId);
    if (!current) throw new ContractTemplateNotFoundError(`Grupo de modelo não encontrado: ${groupId}`);
    return this.templates.createNextVersion(groupId, toRecord(input));
  }

  /** "Duplicar" — cria um GRUPO novo (modelo independente), nunca uma versão do original. */
  async duplicate(sourceId: string, titleOverride?: string): Promise<ContractTemplate> {
    const source = await this.getById(sourceId);
    return this.templates.createFirstVersion({
      title: (titleOverride?.trim() || `${source.title} (cópia)`).slice(0, 180),
      description: source.description,
      category: source.category,
      content: source.content,
      variables: source.variables,
    });
  }

  setActive(id: string, active: boolean): Promise<ContractTemplate> {
    return this.templates.setActive(id, active);
  }
}
