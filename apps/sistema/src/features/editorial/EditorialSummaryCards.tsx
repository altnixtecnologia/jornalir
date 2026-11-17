import Link from "next/link";
import type { EditorialArticleStats } from "./editorialArticleStats";

export function EditorialSummaryCards({ stats }: { stats: EditorialArticleStats }): JSX.Element {
  const items = [
    { key: "total", label: "Total cadastradas", caption: "Inclui arquivadas", count: stats.total,
      href: "/sistema/editorial/materias?view=all&includeArchived=1" },
    { key: "unpublished", label: "Não publicadas", caption: "Rascunhos, ajustes e programadas", count: stats.unpublished,
      href: "/sistema/editorial/materias?view=all&status=unpublished" },
    { key: "scheduled", label: "Programadas", caption: "Aguardando publicação", count: stats.scheduled,
      href: "/sistema/editorial/materias?view=all&status=scheduled" },
    { key: "adjusting", label: "Em ajuste", caption: "Precisam de revisão", count: stats.adjusting,
      href: "/sistema/editorial/materias?view=all&status=adjusting" },
  ] as const;
  return (
    <nav className="editorial-dashboard-cards" aria-label="Indicadores e atalhos de matérias">
      {items.map((item) => (
        <Link className="editorial-dashboard-card" href={item.href} key={item.key}
          title={"Filtrar: " + item.label}>
          <span>{item.label}</span>
          <strong>{item.count === null ? "—" : item.count.toLocaleString("pt-BR")}</strong>
          <small>{item.caption}</small>
        </Link>
      ))}
    </nav>
  );
}
