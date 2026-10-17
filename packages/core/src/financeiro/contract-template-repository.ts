import type { ContractTemplate } from "@ir/types";

export type NewContractTemplateVersionRecord = Omit<ContractTemplate, "id" | "createdByProfileId" | "createdAt" | "active" | "groupId" | "version">;

export class ContractTemplateNotFoundError extends Error {}

/**
 * Deliberadamente SEM update de conteúdo — uma versão, uma vez criada,
 * é imutável (mesmo princípio de ContractRepository.addDocument). A
 * única mutação permitida é `setActive`, que passa pela RPC
 * `set_contract_template_active` (nunca um update direto da
 * aplicação) — ver migration 20261029101000_contract_templates.sql.
 */
export interface ContractTemplateRepository {
  /** Lista só a versão ATUAL (maior version) de cada grupo — nunca o histórico completo nesta visão. */
  listCurrentVersions(): Promise<ContractTemplate[]>;
  getById(id: string): Promise<ContractTemplate | null>;
  /** Todas as versões de um grupo, da mais recente para a mais antiga — histórico nunca apagado. */
  listVersionsByGroup(groupId: string): Promise<ContractTemplate[]>;
  getLatestVersionByGroup(groupId: string): Promise<ContractTemplate | null>;
  /** Cria a versão 1 de um grupo novo (groupId = id da própria linha) — usado tanto por "novo modelo" quanto por "duplicar". */
  createFirstVersion(record: NewContractTemplateVersionRecord): Promise<ContractTemplate>;
  /** Cria a próxima versão de um grupo já existente ("editar"). */
  createNextVersion(groupId: string, record: NewContractTemplateVersionRecord): Promise<ContractTemplate>;
  setActive(id: string, active: boolean): Promise<ContractTemplate>;
}
