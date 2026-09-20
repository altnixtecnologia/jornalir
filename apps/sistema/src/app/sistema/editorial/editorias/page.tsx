import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { EditoriasManager } from "../../../../features/editorial/EditoriasManager";
import { editorialSectionService } from "../../../../composition/editorial";

export default async function EditoriasPage(): Promise<JSX.Element> {
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
