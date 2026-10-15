import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import Link from "next/link";
import { ProfileSettings } from "../../../features/perfil/ProfileSettings";

/**
 * Meu perfil — área pessoal da PRÓPRIA conta, disponível para qualquer
 * usuário autenticado independente do papel (nunca dentro de
 * Configurações, que é administrativa/sobre outras contas).
 */
export default function PerfilPage(): JSX.Element {
  return (
    <>
      <ModuleHeader eyebrow="CONTA" title="Meu perfil" description="Dados da sua conta e segurança de acesso." />
      <ProfileSettings />
      <p><Link href="/sistema/preferencias-notificacoes">Configurar notificações do aplicativo →</Link></p>
    </>
  );
}
