import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { UsersManager } from "../../../features/usuarios/UsersManager";

export default function UsuariosPage(): JSX.Element {
  return (
    <>
      <ModuleHeader
        eyebrow="ADMINISTRAÇÃO / USUÁRIOS"
        title="Usuários"
        description="Quem tem acesso ao painel — papel, status e criação."
      />
      <UsersManager />
    </>
  );
}
