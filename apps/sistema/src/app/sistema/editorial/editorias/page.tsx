import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { EditoriasManager } from "../../../../features/editorial/EditoriasManager";
import { getEditorialSectionService } from "../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export default async function EditoriasPage(): Promise<JSX.Element> {
  const editorialSectionService = getEditorialSectionService(createSupabaseServerClient());
  const sections = await editorialSectionService.list();

  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / EDITORIAS"
        title="Editorias"
        description="Os assuntos que toda matéria pertence sempre a um. Nunca fixas na tela — organize, ative e ordene aqui."
      />
      <EditoriasManager sections={sections} />
    </>
  );
}
