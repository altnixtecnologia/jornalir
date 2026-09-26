import {
  EDITORIAL_PLACEMENT_LIMITS,
  type Article,
  type ArticleMedia,
  type ArticleOrigin,
  type AuditContext,
  type EditorialPlacement,
  type EditorialPlacementType,
  type EditorialTextStyle,
  type NotificationMode,
} from "@ir/types";
import type {
  ArticleChanges,
  ArticleFilters,
  ArticleRepository,
  NewArticleRecord,
} from "./article-repository";
import type { EditorialSectionRepository } from "./editorial-section-repository";
import type { LocalityRepository } from "./locality-repository";

export class ArticleNotFoundError extends Error {
  constructor(id: string) {
    super(`Matéria não encontrada: ${id}`);
  }
}

export class EditorialSectionNotFoundError extends Error {
  constructor(id: string) {
    super(`Editoria não encontrada: ${id}`);
  }
}

export class LocalityNotFoundError extends Error {
  constructor(id: string) {
    super(`Localidade não encontrada: ${id}`);
  }
}

export interface CreateArticleInput {
  title: string;
  titleStyle?: EditorialTextStyle;
  subtitle?: string;
  subtitleStyle?: EditorialTextStyle;
  body: string;
  sectionId: string;
  localityId: string;
  urgent?: boolean;
  notificationMode?: NotificationMode;
  media?: ArticleMedia[];
  origin?: ArticleOrigin;
  editionId?: string;
  editionPageNumber?: number;
  createdBy: string;
}

export interface ScheduleArticleInput {
  scheduledAt: string;
  placement?: EditorialPlacement;
  notificationMode?: NotificationMode;
}

/**
 * Regras do núcleo editorial: toda matéria pertence a uma editoria, localidade
 * é independente, publicação é sempre uma ação explícita e conteúdo importado
 * de PDF entra sempre como rascunho (ver Partes C, E e G do Plano Mestre).
 *
 * `audit` é recebido em cada operação para não inviabilizar o registro de
 * auditoria no backend futuro; nesta fase mock nenhum log é gravado.
 */
export class ArticleService {
  constructor(
    private readonly articles: ArticleRepository,
    private readonly sections: EditorialSectionRepository,
    private readonly localities: LocalityRepository,
  ) {}

  list(filters?: ArticleFilters): Promise<Article[]> {
    return this.articles.list(filters);
  }

  async getById(id: string): Promise<Article> {
    const article = await this.articles.getById(id);
    if (!article) {
      throw new ArticleNotFoundError(id);
    }
    return article;
  }

  async saveDraft(input: CreateArticleInput, _audit: AuditContext): Promise<Article> {
    await this.assertSectionExists(input.sectionId);
    await this.assertLocalityExists(input.localityId);

    const record: NewArticleRecord = {
      title: input.title,
      titleStyle: input.titleStyle,
      subtitle: input.subtitle,
      subtitleStyle: input.subtitleStyle,
      body: input.body,
      sectionId: input.sectionId,
      localityId: input.localityId,
      status: "draft",
      placement: { type: "none" },
      urgent: input.urgent ?? false,
      notificationMode: input.notificationMode ?? "none",
      media: input.media ?? [],
      origin: input.origin ?? "manual",
      editionId: input.editionId,
      editionPageNumber: input.editionPageNumber,
      createdBy: input.createdBy,
    };

    return this.articles.create(record);
  }

  async updateDraft(
    id: string,
    changes: ArticleChanges,
    _audit: AuditContext,
  ): Promise<Article> {
    if (changes.sectionId) {
      await this.assertSectionExists(changes.sectionId);
    }
    if (changes.localityId) {
      await this.assertLocalityExists(changes.localityId);
    }

    let finalChanges = changes;
    if (changes.placement) {
      const current = await this.getById(id);
      finalChanges = { ...changes, placement: this.stampPlacement(current.placement, changes.placement) };
    }

    const updated = await this.articles.update(id, finalChanges);
    // A vaga só é disputada/expulsa quando a matéria já está `published` de
    // verdade — um rascunho com destino escolhido não pode expulsar quem já
    // está visível (Fase 25, item 9). `schedule`/`publishNow` é quem aciona
    // a disputa, nunca `updateDraft` por si só.
    if (updated.status === "published" && updated.placement.type !== "none") {
      await this.enforcePlacementLimit(updated.placement.type);
    }
    return updated;
  }

  async publishNow(id: string, _audit: AuditContext): Promise<Article> {
    const updated = await this.articles.update(id, {
      status: "published",
      publishedAt: new Date().toISOString(),
    });
    if (updated.placement.type !== "none") {
      await this.enforcePlacementLimit(updated.placement.type);
    }
    return updated;
  }

  async schedule(
    id: string,
    input: ScheduleArticleInput,
    _audit: AuditContext,
  ): Promise<Article> {
    let placement = input.placement;
    if (placement) {
      const current = await this.getById(id);
      placement = this.stampPlacement(current.placement, placement);
    }

    // Nunca chama enforcePlacementLimit aqui: uma matéria agendada para o
    // futuro nunca disputa/expulsa vaga hoje (Fase 25, item 8) — a disputa
    // só acontece quando ela de fato é publicada (publishNow).
    return this.articles.update(id, {
      status: "scheduled",
      scheduledAt: input.scheduledAt,
      placement,
      notificationMode: input.notificationMode,
    });
  }

  archive(id: string, _audit: AuditContext): Promise<Article> {
    return this.articles.update(id, { status: "archived" });
  }

  /**
   * Matérias atualmente visíveis numa posição editorial, prontas para
   * exibição pública — só `published`, respeitando a janela `startsAt`/
   * `endsAt` quando definida, na mesma ordem determinística usada pela
   * rotação (`setAt` mais recente primeiro). Preparado para consumo futuro
   * do portal; nenhuma tela usa isto ainda nesta fase.
   */
  async listActivePlacement(
    type: Exclude<EditorialPlacementType, "none">,
    now: Date = new Date(),
  ): Promise<Article[]> {
    const occupants = await this.articles.list({ placementType: type, status: "published" });
    const nowIso = now.toISOString();
    const visible = occupants.filter(
      (article) =>
        (!article.placement.startsAt || article.placement.startsAt <= nowIso) &&
        (!article.placement.endsAt || article.placement.endsAt >= nowIso),
    );

    // Rede de segurança de leitura: fixadas sempre aparecem, e o total
    // nunca ultrapassa o limite da posição mesmo se o bookkeeping do banco
    // (active=true) ainda não tiver reagido a uma mudança recente — sem
    // depender de cron, a query em si nunca mostra mais que o limite.
    // Fixadas: ordem manual (`pinnedRank`, Fase 29) — sem rank definido
    // (fixada antes dessa fase existir), cai para `setAt` como antes.
    const pinned = visible
      .filter((article) => article.placement.pinned)
      .sort((a, b) => {
        const rankA = a.placement.pinnedRank;
        const rankB = b.placement.pinnedRank;
        if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
        if (rankA !== undefined) return -1;
        if (rankB !== undefined) return 1;
        return (b.placement.setAt ?? "").localeCompare(a.placement.setAt ?? "");
      });
    const unpinned = visible
      .filter((article) => !article.placement.pinned)
      .sort((a, b) => (b.placement.setAt ?? "").localeCompare(a.placement.setAt ?? ""));
    const limit = EDITORIAL_PLACEMENT_LIMITS[type];
    return [...pinned, ...unpinned].slice(0, limit);
  }

  /** Fixa/desafixa (só faz sentido em `mainCover`) sem alterar editoria/localidade/conteúdo/status. */
  async setPlacementPinned(id: string, pinned: boolean): Promise<Article> {
    const current = await this.getById(id);
    if (current.placement.type !== "mainCover") {
      throw new Error("Fixar só é possível na Capa principal.");
    }
    const updated = await this.articles.update(id, {
      placement: { ...current.placement, pinned, pinnedRank: pinned ? current.placement.pinnedRank : undefined },
    });
    if (updated.status === "published") {
      await this.enforcePlacementLimit("mainCover");
    }
    return updated;
  }

  /**
   * Encerra só o placement (Fase 29, item 2: "remover de um destaque =
   * encerrar apenas o placement") — nunca toca editoria, localidade,
   * conteúdo ou status, e nunca apaga a matéria.
   */
  removeFromPlacement(id: string): Promise<Article> {
    return this.articles.update(id, { placement: { type: "none" } });
  }

  /**
   * Ordem manual entre fixadas de `mainCover` (Fase 29) — nunca mexe em
   * matérias não fixadas (essas continuam girando por recência sozinhas).
   */
  async reorderPinnedMainCover(orderedArticleIds: string[]): Promise<void> {
    for (let index = 0; index < orderedArticleIds.length; index += 1) {
      const current = await this.getById(orderedArticleIds[index]);
      if (current.placement.type !== "mainCover" || !current.placement.pinned) continue;
      await this.articles.update(orderedArticleIds[index], {
        placement: { ...current.placement, pinnedRank: index },
      });
    }
  }

  /**
   * `setAt` só é renovado quando o `type` realmente muda — ajustar só
   * `pinned` ou a janela de datas, mantendo o mesmo tipo, não "fura fila"
   * na rotação por recência.
   */
  private stampPlacement(current: EditorialPlacement | undefined, next: EditorialPlacement): EditorialPlacement {
    if (next.type === "none") {
      return { type: "none" };
    }
    const typeChanged = !current || current.type !== next.type;
    return {
      ...next,
      setAt: typeChanged ? new Date().toISOString() : (current?.setAt ?? new Date().toISOString()),
    };
  }

  /**
   * Rotação automática e determinística (nunca a ordem incidental do
   * banco): fixadas (`pinned`) nunca são expulsas e sempre ocupam uma
   * vaga; as vagas restantes até o limite da posição vão para as matérias
   * definidas mais recentemente (`setAt`); o que sobra volta para "Nenhuma"
   * — nunca apagado, nunca muda editoria/localidade/status.
   */
  private async enforcePlacementLimit(type: Exclude<EditorialPlacementType, "none">): Promise<void> {
    const limit = EDITORIAL_PLACEMENT_LIMITS[type];
    // Só conta/expulsa entre matérias já `published` — rascunho/ajuste/
    // agendada/arquivada nunca disputam vaga (Fase 25, item 8/9).
    const occupants = await this.articles.list({ placementType: type, status: "published" });
    const pinned = occupants.filter((article) => article.placement.pinned);
    const unpinned = [...occupants.filter((article) => !article.placement.pinned)].sort((a, b) =>
      (b.placement.setAt ?? "").localeCompare(a.placement.setAt ?? ""),
    );
    const remainingSlots = Math.max(0, limit - pinned.length);
    const evicted = unpinned.slice(remainingSlots);
    for (const article of evicted) {
      await this.articles.update(article.id, { placement: { type: "none" } });
    }
  }

  /** Conteúdo vindo de importação de PDF sempre entra como rascunho. */
  importAsDraft(
    input: Omit<CreateArticleInput, "origin">,
    audit: AuditContext,
  ): Promise<Article> {
    return this.saveDraft({ ...input, origin: "pdfImport" }, audit);
  }

  private async assertSectionExists(sectionId: string): Promise<void> {
    const section = await this.sections.getById(sectionId);
    if (!section) {
      throw new EditorialSectionNotFoundError(sectionId);
    }
  }

  private async assertLocalityExists(localityId: string): Promise<void> {
    const locality = await this.localities.getById(localityId);
    if (!locality) {
      throw new LocalityNotFoundError(localityId);
    }
  }
}
