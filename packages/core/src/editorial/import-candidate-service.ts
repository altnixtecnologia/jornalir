import type { ArticleMedia, AuditContext, ImportCandidate } from "@ir/types";
import type {
  ImportCandidateChanges,
  ImportCandidateFilters,
  ImportCandidateRepository,
  NewImportCandidateRecord,
} from "./import-candidate-repository";
import type { ArticleService } from "./article-service";

export class ImportCandidateNotFoundError extends Error {
  constructor(id: string) {
    super(`Candidato de importação não encontrado: ${id}`);
  }
}

/**
 * Defesa em profundidade: a interface já esconde a ação de converter para um
 * candidato que não está mais pendente, mas o serviço nunca deve confiar só
 * na UI — duas conversões do mesmo candidato criariam duas matérias
 * silenciosamente duplicadas.
 */
export class ImportCandidateAlreadyProcessedError extends Error {
  constructor(id: string, status: ImportCandidate["status"], createdArticleId?: string) {
    super(
      status === "converted"
        ? `Candidato ${id} já foi convertido em matéria${createdArticleId ? ` (${createdArticleId})` : ""} — não é possível converter de novo.`
        : `Candidato ${id} já foi descartado e não pode ser convertido.`,
    );
  }
}

export interface ReviewCandidateInput {
  title?: string;
  subtitle?: string;
  body?: string;
  sectionId?: string;
  localityId?: string;
  pageNumber?: number;
  mediaAssetIds?: string[];
}

export interface ConvertCandidateInput extends ReviewCandidateInput {
  media?: ArticleMedia[];
  createdBy: string;
}

function dedupe(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

/**
 * Divisão simples do corpo em dois candidatos, sem parser real de PDF: corta
 * em blocos HTML de nível superior (parágrafo, citação, lista, subtítulo
 * interno) e reparte pela metade; sem blocos identificáveis, reparte o texto
 * puro pela metade dos caracteres.
 */
function splitBodyInHalf(body: string): { first: string; second: string } {
  if (!body.trim()) {
    return { first: body, second: "" };
  }
  const blocks = body
    .split(/(?<=<\/(?:p|h3|blockquote|ul|ol)>)/i)
    .filter((block) => block.trim().length > 0);

  if (blocks.length <= 1) {
    const mid = Math.ceil(body.length / 2);
    return { first: body.slice(0, mid), second: body.slice(mid) };
  }

  const splitIndex = Math.max(1, Math.ceil(blocks.length / 2));
  return {
    first: blocks.slice(0, splitIndex).join(""),
    second: blocks.slice(splitIndex).join(""),
  };
}

/**
 * Revisão de candidatos importados de PDF (Parte G do Plano Mestre). Nenhum
 * candidato vira matéria publicada automaticamente: `convertToDraft` sempre
 * usa `ArticleService.importAsDraft`, que força `status: "draft"`.
 */
export class ImportCandidateService {
  constructor(
    private readonly candidates: ImportCandidateRepository,
    private readonly articles: ArticleService,
  ) {}

  list(filters?: ImportCandidateFilters): Promise<ImportCandidate[]> {
    return this.candidates.list(filters);
  }

  async getById(id: string): Promise<ImportCandidate> {
    const candidate = await this.candidates.getById(id);
    if (!candidate) {
      throw new ImportCandidateNotFoundError(id);
    }
    return candidate;
  }

  /** Cria um lote de candidatos (extraídos de um PDF real ou de outra origem futura). */
  createBatch(records: NewImportCandidateRecord[]): Promise<ImportCandidate[]> {
    return this.candidates.createMany(records);
  }

  /** Mantém o candidato em revisão, salvando os ajustes feitos manualmente. */
  keep(id: string, changes: ReviewCandidateInput): Promise<ImportCandidate> {
    const patch: ImportCandidateChanges = {};
    if (changes.title !== undefined) patch.suggestedTitle = changes.title;
    if (changes.subtitle !== undefined) patch.suggestedSubtitle = changes.subtitle;
    if (changes.body !== undefined) patch.suggestedBody = changes.body;
    if (changes.sectionId !== undefined) patch.suggestedSectionId = changes.sectionId;
    if (changes.localityId !== undefined) patch.suggestedLocalityId = changes.localityId;
    if (changes.pageNumber !== undefined) patch.pageNumber = changes.pageNumber;
    if (changes.mediaAssetIds !== undefined) patch.suggestedMediaAssetIds = changes.mediaAssetIds;
    return this.candidates.update(id, patch);
  }

  /** Publicidade ou conteúdo indesejado pode ser descartado sem nunca virar matéria. */
  discard(id: string): Promise<ImportCandidate> {
    return this.candidates.update(id, { status: "discarded" });
  }

  /** Combina o conteúdo de um ou mais candidatos secundários no candidato principal. */
  async merge(primaryId: string, secondaryIds: string[]): Promise<ImportCandidate> {
    const uniqueSecondaryIds = dedupe(secondaryIds).filter((id) => id !== primaryId);
    const primary = await this.getById(primaryId);

    let mergedBody = primary.suggestedBody ?? "";
    let mergedMedia = [...(primary.suggestedMediaAssetIds ?? [])];

    for (const secondaryId of uniqueSecondaryIds) {
      const secondary = await this.getById(secondaryId);
      if (secondary.suggestedBody) {
        mergedBody = mergedBody ? `${mergedBody}${secondary.suggestedBody}` : secondary.suggestedBody;
      }
      mergedMedia = [...mergedMedia, ...(secondary.suggestedMediaAssetIds ?? [])];
      await this.candidates.update(secondaryId, { status: "discarded", mergedIntoId: primaryId });
    }

    return this.candidates.update(primaryId, {
      suggestedBody: mergedBody,
      suggestedMediaAssetIds: dedupe(mergedMedia),
    });
  }

  /** Divide um candidato em dois; o segundo nasce como novo candidato pendente. */
  async split(id: string): Promise<{ first: ImportCandidate; second: ImportCandidate }> {
    const original = await this.getById(id);
    const { first: firstBody, second: secondBody } = splitBodyInHalf(original.suggestedBody ?? "");

    const first = await this.candidates.update(id, { suggestedBody: firstBody });
    const second = await this.candidates.create({
      editionId: original.editionId,
      pageNumber: original.pageNumber,
      suggestedTitle: original.suggestedTitle ? `${original.suggestedTitle} (parte 2)` : undefined,
      suggestedSubtitle: undefined,
      suggestedBody: secondBody,
      suggestedSectionId: original.suggestedSectionId,
      suggestedLocalityId: original.suggestedLocalityId,
      suggestedMediaAssetIds: [],
      status: "pending",
    });

    return { first, second };
  }

  /**
   * Converte um candidato aprovado em matéria real, sempre como rascunho —
   * conteúdo importado nunca publica automaticamente (Parte G do Plano
   * Mestre). Mantém o vínculo com a edição e a página de origem.
   */
  async convertToDraft(id: string, input: ConvertCandidateInput, audit: AuditContext) {
    const candidate = await this.getById(id);
    if (candidate.status !== "pending") {
      throw new ImportCandidateAlreadyProcessedError(id, candidate.status, candidate.createdArticleId);
    }
    const sectionId = input.sectionId ?? candidate.suggestedSectionId;
    const localityId = input.localityId ?? candidate.suggestedLocalityId;

    if (!sectionId) {
      throw new Error("Selecione a editoria antes de converter em rascunho.");
    }
    if (!localityId) {
      throw new Error("Selecione a localidade antes de converter em rascunho.");
    }

    const article = await this.articles.importAsDraft(
      {
        title: input.title ?? candidate.suggestedTitle ?? "Matéria importada sem título",
        subtitle: input.subtitle ?? candidate.suggestedSubtitle,
        body: input.body ?? candidate.suggestedBody ?? "",
        sectionId,
        localityId,
        media: input.media ?? [],
        editionId: candidate.editionId,
        editionPageNumber: input.pageNumber ?? candidate.pageNumber,
        createdBy: input.createdBy,
      },
      audit,
    );

    await this.candidates.update(id, { status: "converted", createdArticleId: article.id });
    return article;
  }
}
