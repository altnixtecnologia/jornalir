import { SiteHeader } from "../../../components/site/SiteHeader";
import { NewsNotificationsSettings } from "../../../components/site/NewsNotificationsSettings";

export const metadata = {
  title: "Receba notícias | Informativo Regional",
  description: "Escolha as notícias e os avisos urgentes do Jornal IR que deseja receber.",
};

export default function NewsNotificationsPage(): JSX.Element {
  return (
    <>
      <SiteHeader />
      <main className="site-shell min-h-[65vh] py-8">
        <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--site-muted)]">JORNAL IR</p>
        <h1 className="mt-2 text-2xl font-bold">Notificações</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed">
          Ative, atualize ou desative os avisos de notícias neste aparelho.
          Notícias urgentes usam prioridade maior quando o navegador permite;
          toque personalizado de sistema só estará disponível nas versões nativas compatíveis.
        </p>
        <NewsNotificationsSettings />
      </main>
    </>
  );
}
