import { SiteHeader } from "../../../components/site/SiteHeader";
import { SitePushPreferences } from "../../../components/site/public/SitePushPreferences";
import { NativePushPreferences } from "../../../components/site/public/NativePushPreferences";
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
        {/* NativePushPreferences só renderiza algo dentro do app Android
            instalado (Capacitor.isNativePlatform()); no navegador comum
            fica null e só o Web Push abaixo aparece (19/10/2026). */}
        <NativePushPreferences />
        <SitePushPreferences />
      </div>
    </main>
  );
}
