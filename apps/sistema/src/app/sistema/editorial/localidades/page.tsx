import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { LocalidadesManager } from "../../../../features/editorial/LocalidadesManager";
import { localityService } from "../../../../composition/editorial";

export default async function LocalidadesPage(): Promise<JSX.Element> {
  const localities = await localityService.list();

  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / LOCALIDADES"
        title="Localidades"
        description="Cidade, região ou abrangência geral — sempre independente da editoria."
      />
      <LocalidadesManager localities={localities} />
    </>
  );
}
