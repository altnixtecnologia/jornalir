"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Article, ArticleOrigin, ArticleStatus, EditorialSection, Locality, NewspaperEdition } from "@ir/types";
import {
  articleOriginLabels,
  articleStatusLabels,
  editionPageLabel,
  hasCoverImage,
  mediaSummary,
  notificationLabels,
  placementLabels,
  publicationDate,
} from "./editorialLabels";

export interface MateriasListFilters {
  q: string;
  status: ArticleStatus | "all";
  sectionId: string;
  localityId: string;
  origin: ArticleOrigin | "all";
}

interface MateriasListProps {
  articles: Article[];
  sections: EditorialSection[];
  localities: Locality[];
  editions: NewspaperEdition[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: MateriasListFilters;
}

const STATUS_OPTIONS: ArticleStatus[] = ["draft", "adjusting", "scheduled", "published", "archived"];
const ORIGIN_OPTIONS: ArticleOrigin[] = ["manual", "pdfImport", "legacySite"];
type PhotoFilter = "all" | "withPhoto" | "withoutPhoto";
type HighlightFilter = "all" | "withHighlight" | "withoutHighlight";

export function MateriasList({
  articles,
  sections,
  localities,
  editions,
  total,
  page,
  pageSize,
  totalPages,
  filters,
}: MateriasListProps): JSX.Element {
  // Estes dois filtros são deliberadamente locais à página atual. Os filtros
  // de grande cardinalidade (busca/status/editoria/localidade/origem) rodam
  // no banco para nunca carregar dezenas de milhares de matérias no browser.
  const [photoFilter, setPhotoFilter] = useState<PhotoFilter>("all");
  const [highlightFilter, setHighlightFilter] = useState<HighlightFilter>("all");

  const sectionById = useMemo(() => new Map(sections.map((section) => [section.id, section])), [sections]);
  const localityById = useMemo(() => new Map(localities.map((locality) => [locality.id, locality])), [localities]);
  const editionById = useMemo(() => new Map(editions.map((edition) => [edition.id, edition])), [editions]);

  const filtered = useMemo(
    () =>
      articles.filter((article) => {
        if (photoFilter === "withPhoto" && article.media.length === 0) return false;
        if (photoFilter === "withoutPhoto" && article.media.length > 0) return false;
        if (highlightFilter === "withHighlight" && article.placement.type === "none") return false;
        if (highlightFilter === "withoutHighlight" && article.placement.type !== "none") return false;
        return true;
      }),
    [articles, photoFilter, highlightFilter],
  );

  function buildHref(targetPage: number, targetPageSize = pageSize): string {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.sectionId !== "all") params.set("section", filters.sectionId);
    if (filters.localityId !== "all") params.set("locality", filters.localityId);
    if (filters.origin !== "all") params.set("origin", filters.origin);
    params.set("page", String(targetPage));
    params.set("pageSize", String(targetPageSize));
    return `/sistema/editorial/materias?${params.toString()}`;
  }

  return (
    <>
      <form className="materias-toolbar" method="get" action="/sistema/editorial/materias">
        <div className="materias-filters">
          <label className="materias-search">
            Buscar
            <input name="q" type="search" defaultValue={filters.q} placeholder="Título, subtítulo ou referência" />
          </label>
          <label>
            Status
            <select name="status" defaultValue={filters.status}>
              <option value="all">Todos</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{articleStatusLabels[status]}</option>
              ))}
            </select>
          </label>
          <label>
            Editoria
            <select name="section" defaultValue={filters.sectionId}>
              <option value="all">Todas</option>
              {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
            </select>
          </label>
          <label>
            Localidade
            <select name="locality" defaultValue={filters.localityId}>
              <option value="all">Todas</option>
              {localities.map((locality) => <option key={locality.id} value={locality.id}>{locality.name}</option>)}
            </select>
          </label>
          <label>
            Origem
            <select name="origin" defaultValue={filters.origin}>
              <option value="all">Todas</option>
              {ORIGIN_OPTIONS.map((origin) => <option key={origin} value={origin}>{articleOriginLabels[origin]}</option>)}
            </select>
          </label>
          <label>
            Por página
            <select name="pageSize" defaultValue={String(pageSize)}>
              <option value="24">24</option>
              <option value="48">48</option>
              <option value="96">96</option>
            </select>
          </label>
          <button type="submit">Aplicar filtros</button>
          <Link className="secondary-link" href="/sistema/editorial/materias">Limpar</Link>
        </div>
        <span className="materias-count">Página {page} de {totalPages} · {total} matéria(s)</span>
      </form>

      <div className="materias-toolbar">
        <div className="materias-filters">
          <label>
            Fotos nesta página
            <select value={photoFilter} onChange={(event) => setPhotoFilter(event.target.value as PhotoFilter)}>
              <option value="all">Todas</option>
              <option value="withPhoto">Com foto</option>
              <option value="withoutPhoto">Sem foto</option>
            </select>
          </label>
          <label>
            Destaque nesta página
            <select value={highlightFilter} onChange={(event) => setHighlightFilter(event.target.value as HighlightFilter)}>
              <option value="all">Todos</option>
              <option value="withHighlight">Com destaque</option>
              <option value="withoutHighlight">Sem destaque</option>
            </select>
          </label>
        </div>
        <span className="materias-count">{filtered.length} de {articles.length} nesta página</span>
      </div>

      {filtered.length === 0 ? (
        <div className="materias-empty">Nenhuma matéria encontrada com os filtros atuais.</div>
      ) : (
        <>
          <div className="materias-table-wrap">
            <table className="materias-table">
              <thead>
                <tr>
                  <th>Referência</th><th>Matéria</th><th>Origem</th><th>Editoria</th><th>Localidade</th>
                  <th>Status</th><th>Publicação/Programação</th><th>Destaque</th><th>Notificação</th><th>Mídia</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((article) => {
                  const section = sectionById.get(article.sectionId);
                  const locality = localityById.get(article.localityId);
                  const edition = article.editionId ? editionById.get(article.editionId) : undefined;
                  const hasPlacement = article.placement.type !== "none";
                  return (
                    <tr key={article.id}>
                      <td className="materia-reference">{article.reference}</td>
                      <td>
                        <span className="materia-title">{article.urgent ? <span className="urgent-badge">Urgente</span> : null}{article.title}</span>
                        {article.subtitle ? <span className="materia-subtitle">{article.subtitle}</span> : null}
                      </td>
                      <td>
                        <span className={`origin-pill origin-pill--${article.origin}`}>{articleOriginLabels[article.origin]}</span>
                        {edition ? <span className="materia-subtitle">{editionPageLabel(edition.title, article.editionPageNumber)}</span> : null}
                      </td>
                      <td>{section?.name ?? "—"}</td><td>{locality?.name ?? "—"}</td>
                      <td><span className={`status-pill status-pill--${article.status}`}>{articleStatusLabels[article.status]}</span></td>
                      <td>{publicationDate(article)}</td>
                      <td><span className={`placement-pill${hasPlacement ? "" : " placement-pill--muted"}`}>{placementLabels[article.placement.type]}</span></td>
                      <td><span className={`notification-pill notification-pill--${article.notificationMode}`}>{notificationLabels[article.notificationMode]}</span></td>
                      <td><span className={`media-indicator${hasCoverImage(article) ? " media-indicator--cover" : ""}`}>{mediaSummary(article)}</span></td>
                      <td><Link className="materia-open-link" href={`/sistema/editorial/materias/${article.id}`}>Abrir ↗</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="materias-cards">
            {filtered.map((article) => {
              const section = sectionById.get(article.sectionId);
              const locality = localityById.get(article.localityId);
              const edition = article.editionId ? editionById.get(article.editionId) : undefined;
              const hasPlacement = article.placement.type !== "none";
              return (
                <li key={article.id}>
                  <Link className="materia-card" href={`/sistema/editorial/materias/${article.id}`}>
                    <div className="materia-card-head">
                      <span className={`status-pill status-pill--${article.status}`}>{articleStatusLabels[article.status]}</span>
                      <span className="materia-reference">{article.reference}</span>
                    </div>
                    <span className="materia-card-title">{article.urgent ? <span className="urgent-badge">Urgente</span> : null}{article.title}</span>
                    {article.subtitle ? <span className="materia-subtitle">{article.subtitle}</span> : null}
                    <div className="materia-card-meta">
                      <span className={`origin-pill origin-pill--${article.origin}`}>{articleOriginLabels[article.origin]}</span>
                      <span aria-hidden="true">·</span><span>{section?.name ?? "—"}</span>
                      <span aria-hidden="true">·</span><span>{locality?.name ?? "—"}</span>
                      <span aria-hidden="true">·</span><span>{publicationDate(article)}</span>
                      {edition ? <><span aria-hidden="true">·</span><span>{editionPageLabel(edition.title, article.editionPageNumber)}</span></> : null}
                    </div>
                    <div className="materia-card-foot">
                      {hasPlacement ? <span className="placement-pill">{placementLabels[article.placement.type]}</span> : null}
                      {article.notificationMode !== "none" ? <span className={`notification-pill notification-pill--${article.notificationMode}`}>{notificationLabels[article.notificationMode]}</span> : null}
                      <span className={`media-indicator${hasCoverImage(article) ? " media-indicator--cover" : ""}`}>{mediaSummary(article)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {totalPages > 1 ? (
        <nav className="materias-toolbar" aria-label="Paginação de matérias">
          <div className="materias-filters">
            {page > 1 ? <Link className="secondary-link" href={buildHref(page - 1)}>← Anterior</Link> : <span />}
            <span className="materias-count">Página {page} de {totalPages}</span>
            {page < totalPages ? <Link className="secondary-link" href={buildHref(page + 1)}>Próxima →</Link> : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}
