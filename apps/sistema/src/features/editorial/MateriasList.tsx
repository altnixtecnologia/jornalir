"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Article, ArticleOrigin, ArticleStatus, EditorialSection, Locality, NewspaperEdition } from "@ir/types";
import type { MateriasDateField, MateriasSortColumn, SortDirection } from "../../providers/supabase/articleRepository.supabase";
import {
  articleOriginLabels,
  articleStatusLabels,
  editionPageLabel,
  formatDateTime,
  hasCoverImage,
  mediaSummary,
  notificationLabels,
  placementLabels,
} from "./editorialLabels";
import { PaginationControls } from "./PaginationControls";

export interface MateriasListFilters {
  q: string;
  status: ArticleStatus | "all";
  sectionId: string;
  localityId: string;
  origin: ArticleOrigin | "all";
  sortBy: MateriasSortColumn;
  sortDir: SortDirection;
  dateField?: MateriasDateField;
  dateFrom: string;
  dateTo: string;
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

const DATE_FIELD_OPTIONS: { value: MateriasDateField; label: string }[] = [
  { value: "editorial", label: "Data editorial" },
  { value: "published", label: "Publicação" },
  { value: "scheduled", label: "Programação" },
];

// Colunas que ordenam globalmente no banco (Ajuste pós-Fase 49, item 2) —
// mesma coluna de exibição, aria-label deixa claro pra leitor de tela.
const SORTABLE_COLUMNS: { key: MateriasSortColumn; label: string }[] = [
  { key: "reference", label: "Referência" },
  { key: "title", label: "Matéria" },
  { key: "origin", label: "Origem" },
  { key: "section", label: "Editoria" },
  { key: "locality", label: "Abrangência" },
  { key: "status", label: "Status" },
  { key: "date", label: "Publicação/Programação" },
  { key: "notification", label: "Notificação" },
];

/** PUBLICADA/PROGRAMADA nunca podem se confundir visualmente (badge + cor + data/hora distintas). */
function PublicationCell({ article }: { article: Article }): JSX.Element {
  if (article.status === "published") {
    return (
      <span className="pub-cell">
        <span className="pub-badge pub-badge--published">Publicada</span>
        <span className="pub-datetime">{formatDateTime(article.publishedAt)}</span>
      </span>
    );
  }
  if (article.status === "scheduled") {
    return (
      <span className="pub-cell">
        <span className="pub-badge pub-badge--scheduled">Programada</span>
        <span className="pub-datetime">{formatDateTime(article.scheduledAt)}</span>
      </span>
    );
  }
  return <span className="pub-cell pub-cell--muted">Sem data</span>;
}

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
  const [dateFrom, setDateFrom] = useState(filters.dateFrom);
  const [dateTo, setDateTo] = useState(filters.dateTo);

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

  function buildHref(
    targetPage: number,
    targetPageSize = pageSize,
    overrides: { sortBy?: MateriasSortColumn; sortDir?: SortDirection } = {},
  ): string {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.sectionId !== "all") params.set("section", filters.sectionId);
    if (filters.localityId !== "all") params.set("locality", filters.localityId);
    if (filters.origin !== "all") params.set("origin", filters.origin);
    if (filters.dateField) params.set("dateField", filters.dateField);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    const sortBy = overrides.sortBy ?? filters.sortBy;
    const sortDir = overrides.sortDir ?? filters.sortDir;
    if (sortBy !== "date") params.set("sortBy", sortBy);
    if (sortDir !== "desc") params.set("sortDir", sortDir);
    params.set("page", String(targetPage));
    params.set("pageSize", String(targetPageSize));
    return `/sistema/editorial/materias?${params.toString()}`;
  }

  // Clique num cabeçalho ordenável: 1º clique ordena por ele (desc — mais
  // recente/maior primeiro), 2º clique inverte; sempre volta pra página 1,
  // preservando os demais filtros/pageSize (Ajuste pós-Fase 49, item 2).
  function buildSortHref(column: MateriasSortColumn): string {
    const nextDir: SortDirection = filters.sortBy === column && filters.sortDir === "desc" ? "asc" : "desc";
    return buildHref(1, pageSize, { sortBy: column, sortDir: nextDir });
  }

  function sortIndicator(column: MateriasSortColumn): string {
    if (filters.sortBy !== column) return "";
    return filters.sortDir === "asc" ? " ▲" : " ▼";
  }

  return (
    <>
      <form className="materias-toolbar-compact" method="get" action="/sistema/editorial/materias">
        <input type="hidden" name="sortBy" value={filters.sortBy} />
        <input type="hidden" name="sortDir" value={filters.sortDir} />
        <div className="materias-filters-compact">
          <label className="materias-search-compact">
            <span className="sr-only">Buscar</span>
            <input name="q" type="search" defaultValue={filters.q} placeholder="Buscar título, subtítulo ou referência" />
          </label>
          <select name="status" defaultValue={filters.status} aria-label="Status" title="Status">
            <option value="all">Status: todos</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{articleStatusLabels[status]}</option>
            ))}
          </select>
          <select name="section" defaultValue={filters.sectionId} aria-label="Editoria" title="Editoria">
            <option value="all">Editoria: todas</option>
            {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
          </select>
          <select name="locality" defaultValue={filters.localityId} aria-label="Abrangência" title="Abrangência">
            <option value="all">Abrangência: todas</option>
            {localities.map((locality) => <option key={locality.id} value={locality.id}>{locality.name}</option>)}
          </select>
          <select name="origin" defaultValue={filters.origin} aria-label="Origem" title="Origem">
            <option value="all">Origem: todas</option>
            {ORIGIN_OPTIONS.map((origin) => <option key={origin} value={origin}>{articleOriginLabels[origin]}</option>)}
          </select>
          <select name="dateField" defaultValue={filters.dateField ?? ""} aria-label="Tipo de data" title="Tipo de data">
            <option value="">Período: nenhum</option>
            {DATE_FIELD_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <label className="materias-date-compact">
            <span className="sr-only">De</span>
            <input type="date" name="dateFrom" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="De" title="De" />
            {dateFrom ? <button className="materias-date-clear" type="button" onClick={() => setDateFrom("")} aria-label="Limpar data inicial" title="Limpar data inicial">×</button> : null}
          </label>
          <label className="materias-date-compact">
            <span className="sr-only">Até</span>
            <input type="date" name="dateTo" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Até" title="Até" />
            {dateTo ? <button className="materias-date-clear" type="button" onClick={() => setDateTo("")} aria-label="Limpar data final" title="Limpar data final">×</button> : null}
          </label>
          <select name="pageSize" defaultValue={String(pageSize)} aria-label="Por página" title="Por página">
            <option value="24">24/pág.</option>
            <option value="48">48/pág.</option>
            <option value="96">96/pág.</option>
          </select>
          <div className="materias-toolbar-actions">
            <button type="submit">Aplicar</button>
            <Link className="secondary-link" href="/sistema/editorial/materias">Limpar</Link>
          </div>
        </div>
        <div className="materias-toolbar-meta">
          <label className="materias-inline-select">
            Fotos nesta página
            <select value={photoFilter} onChange={(event) => setPhotoFilter(event.target.value as PhotoFilter)}>
              <option value="all">Todas</option>
              <option value="withPhoto">Com foto</option>
              <option value="withoutPhoto">Sem foto</option>
            </select>
          </label>
          <label className="materias-inline-select">
            Destaque nesta página
            <select value={highlightFilter} onChange={(event) => setHighlightFilter(event.target.value as HighlightFilter)}>
              <option value="all">Todos</option>
              <option value="withHighlight">Com destaque</option>
              <option value="withoutHighlight">Sem destaque</option>
            </select>
          </label>
          <span className="materias-count">
            Página {page} de {totalPages} · {total} matéria(s) · {filtered.length} de {articles.length} nesta página
          </span>
        </div>
      </form>

      {filtered.length === 0 ? (
        <div className="materias-empty">Nenhuma matéria encontrada com os filtros atuais.</div>
      ) : (
        <>
          <div className="materias-table-wrap">
            <table className="materias-table">
              <thead>
                <tr>
                  {SORTABLE_COLUMNS.map((column) => (
                    <th key={column.key} aria-sort={filters.sortBy === column.key ? (filters.sortDir === "asc" ? "ascending" : "descending") : "none"}>
                      <Link href={buildSortHref(column.key)} className={`materia-sort-link${filters.sortBy === column.key ? " is-active" : ""}`}>
                        {column.label}
                        {sortIndicator(column.key)}
                      </Link>
                    </th>
                  ))}
                  <th>Destaque</th>
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
                        <Link className="materia-title materia-title-link" href={`/sistema/editorial/materias/${article.id}`}>{article.urgent ? <span className="urgent-badge">Urgente</span> : null}{article.title}</Link>
                        {article.subtitle ? <span className="materia-subtitle">{article.subtitle}</span> : null}
                      </td>
                      <td>
                        <span className={`origin-pill origin-pill--${article.origin}`}>{articleOriginLabels[article.origin]}</span>
                        {edition ? <span className="materia-subtitle">{editionPageLabel(edition.title, article.editionPageNumber)}</span> : null}
                      </td>
                      <td>{section?.name ?? "—"}</td><td>{locality?.name ?? "—"}</td>
                      <td><span className={`status-pill status-pill--${article.status}`}>{articleStatusLabels[article.status]}</span></td>
                      <td><PublicationCell article={article} /></td>
                      <td><span className={`notification-pill notification-pill--${article.notificationMode}`}>{notificationLabels[article.notificationMode]}</span></td>
                      <td><span className={`placement-pill${hasPlacement ? "" : " placement-pill--muted"}`}>{placementLabels[article.placement.type]}</span></td>
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
                      {edition ? <><span aria-hidden="true">·</span><span>{editionPageLabel(edition.title, article.editionPageNumber)}</span></> : null}
                    </div>
                    <div className="materia-card-foot">
                      <PublicationCell article={article} />
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

      <PaginationControls page={page} totalPages={totalPages} buildHref={buildHref} />
    </>
  );
}
