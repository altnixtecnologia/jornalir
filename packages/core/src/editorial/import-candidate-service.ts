import type { ArticleMedia, AuditContext, ImportCandidate } from "@ir/types";
import type {
  ImportBatchMetadata,
  ImportBatchSummary,
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
  createBatch(records: NewImportCandidateRecord[], batchMeta?: ImportBatchMetadata): Promise<ImportCandidate[]> {
    return this.candidates.createMany(records, batchMeta);
  }

  /** Lote já existente pra esta edição com este hash de arquivo, se houver
   * — usado pra avisar reenvio do mesmo PDF antes de gerar um novo lote
   * duplicado (nunca bloqueia sozinho; quem decide é o operador). */
  findBatchByHash(editionId: string, fileHash: string): Promise<ImportBatchSummary | null> {
    return this.candidates.findBatchByHash(editionId, fileHash);
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

  /**
   * Restaura um candidato descartado de volta pra `pending` — origem/
   * rastreabilidade (extraction, página, etc.) nunca é tocada, só o status.
   * Um candidato descartado por ter sido absorvido num merge (`mergedIntoId`
   * preenchido) não pode ser restaurado isoladamente: o conteúdo dele já
   * foi incorporado no candidato principal, restaurar sozinho criaria
   * duplicação de conteúdo entre os dois.
   */
  async restore(id: string): Promise<ImportCandidate> {
    const candidate = await this.getById(id);
    if (candidate.status !== "discarded") {
      throw new Error(`Só é possível restaurar um candidato descartado (status atual: ${candidate.status}).`);
    }
    if (candidate.mergedIntoId) {
      throw new Error("Este candidato foi descartado por mesclagem — restaure a partir do candidato principal, se necessário.");
    }
    return this.candidates.update(id, { status: "pending" });
  }

  /**
   * Combina o conteúdo de um ou mais candidatos secundários no candidato
   * principal. O algoritmo de combinação (concatenar corpo, unir mídia)
   * continua o mesmo desta fase — só a gravação virou atômica: a RPC
   * `merge_import_candidates` valida tudo (status pendente, mesma edição)
   * e grava principal+secundários na mesma transação; qualquer falha
   * desfaz tudo, nunca deixa secundário descartado sem o principal atualizado.
   */
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
    }

    await this.candidates.mergeAtomic(primaryId, {
      secondaryIds: uniqueSecondaryIds,
      mergedBody,
      mergedMediaAssetIds: dedupe(mergedMedia),
    });
    return this.getById(primaryId);
  }

  /**
   * Divide um candidato em dois; o segundo nasce como novo candidato
   * pendente. Algoritmo de divisão (`splitBodyInHalf`) continua o mesmo
   * desta fase — só a gravação virou atômica: a RPC `split_import_candidate`
   * atualiza a primeira metade e cria a segunda na mesma transação, e
   * reaproveita o `batch_id` do candidato original (preserva rastreabilidade
   * do lote de origem, em vez de criar um lote sintético vazio).
   */
  async split(id: string): Promise<{ first: ImportCandidate; second: ImportCandidate }> {
    const original = await this.getById(id);
    if (original.status !== "pending") {
      throw new Error(`Só é possível dividir um candidato pendente (status atual: ${original.status}).`);
    }
    const { first: firstBody, second: secondBody } = splitBodyInHalf(original.suggestedBody ?? "");

    const { firstId, secondId } = await this.candidates.splitAtomic(id, {
      firstBody,
      secondTitle: original.suggestedTitle ? `${original.suggestedTitle} (parte 2)` : undefined,
      secondBody,
    });

    const [first, second] = await Promise.all([this.getById(firstId), this.getById(secondId)]);
    return { first, second };
  }

  /**
   * Converte um candidato aprovado em matéria real, sempre como rascunho —
   * conteúdo importado nunca publica automaticamente (Parte G do Plano
   * Mestre). Mantém o vínculo com a edição e a página de origem.
   *
   * Atômico (RPC `convert_import_candidate_to_draft`): cria a matéria,
   * vincula a mídia e marca o candidato como `converted` na mesma
   * transação — nunca duas matérias pro mesmo candidato, mesmo em retry,
   * duplo clique ou falha de rede no meio do caminho (a RPC trava a linha
   * do candidato com `for update` antes de checar o status, então duas
   * chamadas concorrentes nunca passam as duas pela checagem).
   *
   * A checagem de status aqui ANTES de chamar a RPC é só um atalho pra uma
   * mensagem rápida no caso comum (candidato já convertido faz tempo); a
   * garantia real de não-duplicação é a trava no banco, não esta checagem.
   * Se a RPC ainda assim rejeitar (corrida genuína entre duas chamadas
   * quase simultâneas), o catch abaixo busca o candidato de novo e devolve
   * o erro amigável de "já processado" com a matéria relacionada, nunca o
   * erro bruto do Postgres.
   */
  async convertToDraft(id: string, input: ConvertCandidateInput, _audit: AuditContext) {
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

    let articleId: string;
    try {
      const result = await this.candidates.convertToDraftAtomic(id, {
        title: input.title ?? candidate.suggestedTitle ?? "Matéria importada sem título",
        subtitle: input.subtitle ?? candidate.suggestedSubtitle,
        body: input.body ?? candidate.suggestedBody ?? "",
        sectionId,
        localityId,
        pageNumber: input.pageNumber ?? candidate.pageNumber,
        media: input.media ?? [],
      });
      articleId = result.articleId;
    } catch (error) {
      // Corrida genuína: outra chamada converteu o candidato entre o
      // getById acima e a RPC. Nunca propaga o erro bruto do Postgres —
      // busca o estado real e devolve o erro de domínio já existente.
      const current = await this.candidates.getById(id);
      if (current && current.status === "converted") {
        throw new ImportCandidateAlreadyProcessedError(id, current.status, current.createdArticleId);
      }
      throw error;
    }

    return this.articles.getById(articleId);
  }
}
