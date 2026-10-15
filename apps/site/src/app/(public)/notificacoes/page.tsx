import { SiteHeader } from "../../../components/site/SiteHeader";
import { SitePushPreferences } from "../../../components/site/public/SitePushPreferences";
export const metadata = {
  title: "Notificações do Jornal IR",
  description: "Escolha os avisos que deseja receber do Informativo Regional.",
};
export default function NotificacoesPage(): JSX.Element {
  return (
    <main className="min-h-screen" style={{ background: "var(--site-bg)" }}>
      <SiteHeader />
      <div className="site-shell py-6">
        <h1 className="text-2xl font-bold">Notificações do Jornal IR</h1>
        <SitePushPreferences />
      </div>
    </main>
  );
}
