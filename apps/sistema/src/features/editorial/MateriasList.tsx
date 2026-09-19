"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Article, ArticleStatus, EditorialSection, Locality } from "@ir/types";
import {
  articleStatusLabels,
  hasCoverImage,
  mediaSummary,
  notificationLabels,
  placementLabels,
  publicationDate,
} from "./editorialLabels";

interface MateriasListProps {
  articles: Article[];
  sections: EditorialSection[];
  localities: Locality[];
}

const STATUS_OPTIONS: ArticleStatus[] = [
  "draft",
  "adjusting",
  "scheduled",
  "published",
  "archived",
];

export function MateriasList({ articles, sections, localities }: MateriasListProps): JSX.Element {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ArticleStatus | "all">("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [localityFilter, setLocalityFilter] = useState<string>("all");

  const sectionById = useMemo(
    () => new Map(sections.map((section) => [section.id, section])),
    [sections],
  );
  const localityById = useMemo(
    () => new Map(localities.map((locality) => [locality.id, locality])),
    [localities],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return articles
      .filter((article) => {
        if (statusFilter !== "all" && article.status !== statusFilter) return false;
        if (sectionFilter !== "all" && article.sectionId !== sectionFilter) return false;
        if (localityFilter !== "all" && article.localityId !== localityFilter) return false;
        if (term) {
          const haystack = `${article.reference} ${article.title} ${article.subtitle ?? ""}`.toLowerCase();
          if (!haystack.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [articles, search, statusFilter, sectionFilter, localityFilter]);

  return (
    <>
      <div className="materias-toolbar">
        <div className="materias-filters">
          <label className="materias-search">
            Buscar
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Título, subtítulo ou referência"
            />
          </label>
          <label>
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ArticleStatus | "all")}
            >
              <option value="all">Todos</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {articleStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Editoria
            <select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}>
              <option value="all">Todas</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Localidade
            <select value={localityFilter} onChange={(event) => setLocalityFilter(event.target.value)}>
              <option value="all">Todas</option>
              {localities.map((locality) => (
                <option key={locality.id} value={locality.id}>
                  {locality.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <span className="materias-count">
          {filtered.length} de {articles.length} matéria(s)
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="materias-empty">Nenhuma matéria encontrada com os filtros atuais.</div>
      ) : (
        <div className="materias-table-wrap">
          <table className="materias-table">
            <thead>
              <tr>
                <th>Referência</th>
                <th>Matéria</th>
                <th>Editoria</th>
                <th>Localidade</th>
                <th>Status</th>
                <th>Publicação/Programação</th>
                <th>Destaque</th>
                <th>Notificação</th>
                <th>Mídia</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((article) => {
                const section = sectionById.get(article.sectionId);
                const locality = localityById.get(article.localityId);
                const hasPlacement = article.placement.type !== "none";
                return (
                  <tr key={article.id}>
                    <td className="materia-reference">{article.reference}</td>
                    <td>
                      <span className="materia-title">{article.title}</span>
                      {article.subtitle ? (
                        <span className="materia-subtitle">{article.subtitle}</span>
                      ) : null}
                    </td>
                    <td>{section?.name ?? "—"}</td>
                    <td>{locality?.name ?? "—"}</td>
                    <td>
                      <span className={`status-pill status-pill--${article.status}`}>
                        {articleStatusLabels[article.status]}
                      </span>
                    </td>
                    <td>{publicationDate(article)}</td>
                    <td>
                      <span className={`placement-pill${hasPlacement ? "" : " placement-pill--muted"}`}>
                        {placementLabels[article.placement.type]}
                      </span>
                    </td>
                    <td>
                      <span className={`notification-pill notification-pill--${article.notificationMode}`}>
                        {notificationLabels[article.notificationMode]}
                      </span>
                    </td>
                    <td>
                      <span className={`media-indicator${hasCoverImage(article) ? " media-indicator--cover" : ""}`}>
                        {mediaSummary(article)}
                      </span>
                    </td>
                    <td>
                      <Link className="materia-open-link" href={`/sistema/editorial/materias/${article.id}`}>
                        Abrir ↗
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
