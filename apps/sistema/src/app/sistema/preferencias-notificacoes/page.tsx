import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { NotificationPreferences } from "../../../features/notificacoes/NotificationPreferences";

export default function NotificationPreferencesPage(): JSX.Element {
  return (
    <>
      <ModuleHeader eyebrow="CONTA" title="Preferências de notificações" description="Configure quais tipos de aviso você deseja receber neste dispositivo." />
      <NotificationPreferences />
    </>
  );
}
