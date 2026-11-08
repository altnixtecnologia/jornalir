import type {
  ContractTemplate,
  ContractTemplateDocumentMode,
  ContractTemplateModality,
  ContractTemplateVariable,
} from "@ir/types";

/** Anexo (documento fixo) já armazenado em bucket privado — `path` nunca sai do servidor. */
export interface NewContractTemplateAttachment {
  path: string;
  sha256: string;
  bytes: number;
  note?: string;
}

export interface NewContractTemplateVersionRecord {
  title: string;
  description?: string;
  category?: string;
  content: string;
  variables: ContractTemplateVariable[];
  modality?: ContractTemplateModality;
  specificFor?: string;
  documentMode: ContractTemplateDocumentMode;
  attachment?: NewContractTemplateAttachment;
}

export class ContractTemplateNotFoundError extends Error {}

/**
 * Deliberadamente SEM update de conteúdo — uma versão, uma vez criada,
 * é imutável (trigger no banco). As únicas mutações permitidas passam por
 * RPCs estreitas e auditadas (20261122160000_contract_template_governance):
 * `setActive` (produção), `setTestMode`, `recordLegalApproval` e
 * `revokeLegalApproval`. Ativar para produção exige aprovação jurídica da
 * versão e administrador/proprietário — imposto no banco, não só na tela.
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
  setTestMode(id: string, enabled: boolean): Promise<ContractTemplate>;
  recordLegalApproval(id: string, note: string, evidence: string): Promise<ContractTemplate>;
  revokeLegalApproval(id: string, reason: string): Promise<ContractTemplate>;
  /** Caminho do documento fixo no bucket privado — só para o servidor gerar URL assinada. */
  getAttachmentPath(id: string): Promise<string | null>;
}
