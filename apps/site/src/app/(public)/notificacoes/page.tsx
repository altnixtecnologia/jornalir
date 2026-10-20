import { SiteHeader } from "../../../components/site/SiteHeader";
import { NotificationEnvironmentSettings } from "../../../components/site/public/NotificationEnvironmentSettings";
export const metadata = {
  title: "Notificações do Jornal IR",
  description: "Escolha os avisos que deseja receber do Informativo Regional.",
};
export default function NotificacoesPage(): JSX.Element {
  return (
    <main className="min-h-screen" style={{ background: "var(--site-bg)" }}>
      <SiteHeader />
      <div className="site-shell py-6">
        <h1 className="notification-settings-title text-2xl font-bold">Notificações do Jornal IR</h1>
        {/* Android Capacitor: renderiza somente o painel nativo (montado
            globalmente para receber FCM em qualquer página). Navegadores:
            mostram somente Web Push. Nunca misturar as duas interfaces. */}
        <NotificationEnvironmentSettings />
      </div>
    </main>
  );
}
