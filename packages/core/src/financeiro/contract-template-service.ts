import type {
  ContractTemplate,
  ContractTemplateDocumentMode,
  ContractTemplateModality,
  ContractTemplateVariable,
} from "@ir/types";
import {
  ContractTemplateNotFoundError,
  type ContractTemplateRepository,
  type NewContractTemplateAttachment,
} from "./contract-template-repository";

export class ContractTemplateValidationError extends Error {}

export interface ContractTemplateInput {
  title: string;
  description?: string;
  category?: string;
  content: string;
  variables: ContractTemplateVariable[];
  /** Obrigatória em modelos novos e novas versões (Etapa 1, 08/11/2026). */
  modality?: ContractTemplateModality;
  /** Licitação, prefeitura, Câmara, outra condição — texto livre. */
  specificFor?: string;
  documentMode?: ContractTemplateDocumentMode;
  attachment?: NewContractTemplateAttachment;
}

// Aceita também UM "prefixo.sufixo" (ex.: "contratada.cnpj",
// "cliente.representante_cpf") — mesmo padrão de CONTRACT_TEMPLATE_AUTO_FIELDS
// e dos campos obrigatórios da contratada (CONTRACTOR_FIELDS, em
// commercialPartyRequirements.ts). Achado real (Bloco 3, 01/11/2026):
// a emissão de documentos comerciais (missingCommercialLegalParties)
// EXIGE que o modelo declare "contratada.razao_social"/"contratada.cnpj"/
// "contratada.endereco"/"contratada.representante" em `variables`, mas
// a regex original (sem ponto) tornava isso impossível de salvar pela
// tela — nenhum modelo comercial jamais teria passado por aqui. Nunca
// aceita mais de um ponto (nunca "a.b.c") nem ponto nas pontas.
const VARIABLE_KEY_RE = /^[a-z][a-z0-9_]{0,29}(?:\.[a-z][a-z0-9_]{0,29})?$/;
const ATTACHMENT_PATH_RE = /^templates\/([0-9a-f]{64})\.pdf$/;

export const FIXED_PDF_PLACEHOLDER_CONTENT =
  "Documento fixo anexo (PDF). As variáveis NÃO são mescladas neste modelo: o conteúdo é usado exatamente como enviado, com conferência manual obrigatória antes de qualquer uso.";

function validate(input: ContractTemplateInput): void {
  if (!input.title.trim() || input.title.trim().length < 3) {
    throw new ContractTemplateValidationError("Informe um título com pelo menos 3 caracteres.");
  }
  if (input.modality !== "commercial" && input.modality !== "institutional") {
    throw new ContractTemplateValidationError("Selecione a modalidade do modelo (Comercial ou Institucional).");
  }
  const specific = input.specificFor?.trim();
  if (specific && (specific.length < 3 || specific.length > 200)) {
    throw new ContractTemplateValidationError('O campo "específico para" deve ter entre 3 e 200 caracteres.');
  }
  const mode = input.documentMode ?? "text";
  if (mode === "fixed_pdf") {
    const attachment = input.attachment;
    if (!attachment) {
      throw new ContractTemplateValidationError("Envie o PDF do documento fixo antes de salvar.");
    }
    const match = ATTACHMENT_PATH_RE.exec(attachment.path);
    if (!match || match[1] !== attachment.sha256) {
      throw new ContractTemplateValidationError("Anexo inválido: envie o PDF novamente.");
    }
    if (!Number.isInteger(attachment.bytes) || attachment.bytes < 1 || attachment.bytes > 10 * 1024 * 1024) {
      throw new ContractTemplateValidationError("O PDF do documento fixo deve ter até 10 MB.");
    }
    if (input.variables.length > 0) {
      throw new ContractTemplateValidationError(
        "Documento fixo não mescla variáveis: remova os campos variáveis ou use um modelo de texto.",
      );
    }
    return;
  }
  if (input.attachment) {
    throw new ContractTemplateValidationError("Modelo de texto não aceita PDF anexo.");
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
  const mode = input.documentMode ?? "text";
  return {
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    category: input.category?.trim() || undefined,
    content: mode === "fixed_pdf" && !input.content.trim() ? FIXED_PDF_PLACEHOLDER_CONTENT : input.content,
    variables: input.variables,
    modality: input.modality,
    specificFor: input.specificFor?.trim() || undefined,
    documentMode: mode,
    attachment: mode === "fixed_pdf" ? input.attachment : undefined,
  };
}

function requireText(value: string, min: number, message: string): string {
  const trimmed = value.trim();
  if (trimmed.length < min) throw new ContractTemplateValidationError(message);
  return trimmed;
}

/**
 * Modelos de contrato — gerencia criação, edição (sempre uma versão nova,
 * nunca sobrescreve), duplicação (grupo novo), modo de teste, aprovação
 * jurídica e ativação para produção. `createdByProfileId` nunca é
 * recebido por parâmetro (o autor real vem da sessão autenticada). NUNCA
 * gera PDF (ver apps/sistema/src/lib/contracts/contractTemplatePdf.ts,
 * server-only). As regras de produção (aprovação jurídica + admin/owner)
 * são impostas pelo BANCO; o serviço só valida entrada e delega.
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

  /** "Duplicar" — cria um GRUPO novo (modelo independente), nunca uma versão do original. Nasce rascunho (sem teste, sem aprovação). */
  async duplicate(sourceId: string, titleOverride?: string): Promise<ContractTemplate> {
    const source = await this.getById(sourceId);
    let attachment: NewContractTemplateAttachment | undefined;
    if (source.documentMode === "fixed_pdf" && source.attachment) {
      const path = await this.templates.getAttachmentPath(sourceId);
      if (!path) throw new ContractTemplateValidationError("O PDF do documento original não foi encontrado.");
      attachment = { path, sha256: source.attachment.sha256, bytes: source.attachment.bytes, note: source.attachment.note };
    }
    return this.templates.createFirstVersion({
      title: (titleOverride?.trim() || `${source.title} (cópia)`).slice(0, 180),
      description: source.description,
      category: source.category,
      content: source.content,
      variables: source.variables,
      modality: source.modality,
      specificFor: source.specificFor,
      documentMode: source.documentMode,
      attachment,
    });
  }

  /** Ativa/desativa em PRODUÇÃO. Ativar exige aprovação jurídica da versão e admin/owner (banco). */
  setActive(id: string, active: boolean): Promise<ContractTemplate> {
    return this.templates.setActive(id, active);
  }

  /** Habilita/desabilita para TESTE ("MINUTA DE TESTE — SEM EFEITO CONTRATUAL"); nunca equivale a produção. */
  setTestMode(id: string, enabled: boolean): Promise<ContractTemplate> {
    return this.templates.setTestMode(id, enabled);
  }

  async recordLegalApproval(id: string, note: string, evidence: string): Promise<ContractTemplate> {
    return this.templates.recordLegalApproval(
      id,
      requireText(note, 10, "Informe a nota da revisão jurídica (mínimo 10 caracteres)."),
      requireText(evidence, 3, "Informe a evidência da revisão (parecer, e-mail, identificação do advogado)."),
    );
  }

  async revokeLegalApproval(id: string, reason: string): Promise<ContractTemplate> {
    return this.templates.revokeLegalApproval(id, requireText(reason, 10, "Informe o motivo da revogação (mínimo 10 caracteres)."));
  }

  /** Só para o servidor: caminho privado do documento fixo (nunca enviado ao navegador). */
  getAttachmentPath(id: string): Promise<string | null> {
    return this.templates.getAttachmentPath(id);
  }
}
