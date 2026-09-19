import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { EditorialOverview } from "../../../features/editorial/EditorialOverview";

export default function EditorialPage(): JSX.Element {
  return (
    <>
      <ModuleHeader
        eyebrow="REDAÇÃO / EDITORIAL"
        title="Histórias que conectam a região."
        description="Organização e cuidado em cada etapa do conteúdo do jornal."
      />
      <EditorialOverview />
    </>
  );
}
