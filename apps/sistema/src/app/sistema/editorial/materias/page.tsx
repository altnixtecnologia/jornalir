import Link from "next/link";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { MateriasList } from "../../../../features/editorial/MateriasList";
import {
  getArticleService,
  getEditorialSectionService,
  getLocalityService,
  getNewspaperEditionService,
} from "../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export default async function MateriasPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const [articles, sections, localities, editions] = await Promise.all([
    getArticleService(supabase).list(),
    getEditorialSectionService(supabase).list(),
    getLocalityService(supabase).list(),
    getNewspaperEditionService(supabase).list(),
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
      <MateriasList articles={articles} sections={sections} localities={localities} editions={editions} />
    </>
  );
}
