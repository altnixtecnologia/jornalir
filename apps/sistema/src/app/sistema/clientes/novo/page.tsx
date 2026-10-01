import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { ClientForm } from "../../../../features/clientes/ClientForm";

export default function NovoClientePage(): JSX.Element {
  return (
    <>
      <ModuleHeader
        eyebrow="CLIENTES / NOVO"
        title="Novo cliente"
        description="Identificação, contato, endereço e papéis em um só lugar."
      />
      <ClientForm mode="create" />
    </>
  );
}
