import Link from "next/link";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { MateriasList } from "../../../../features/editorial/MateriasList";
import {
  articleService,
  editorialSectionService,
  localityService,
} from "../../../../composition/editorial";

export default async function MateriasPage(): Promise<JSX.Element> {
  const [articles, sections, localities] = await Promise.all([
    articleService.list(),
    editorialSectionService.list(),
    localityService.list(),
  ]);

  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / MATÉRIAS"
        title="Matérias"
        description="Todo o conteúdo da redação, com editoria, localidade e status sempre visíveis."
        action={
          <Link className="header-action" href="/sistema/editorial/materias/nova">
            Nova matéria <span aria-hidden="true">＋</span>
          </Link>
        }
      />
      <MateriasList articles={articles} sections={sections} localities={localities} />
    </>
  );
}
