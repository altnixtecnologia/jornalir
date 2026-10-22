/** Exibido imediatamente durante a navegação entre rotas server-rendered.
 * Mantém o menu inferior e o cabeçalho visíveis (o layout do sistema persiste).
 * Não substitui autorização no middleware nem oculta erros de rede.
 */
export default function SistemaLoading(): JSX.Element {
  return (
    <div className="ir-route-loading" role="status" aria-live="polite" aria-label="Carregando página">
      <div className="ir-route-loading-bar" />
      <div className="ir-route-loading-header" />
      <div className="ir-route-loading-line" />
      <div className="ir-route-loading-line is-short" />
      <div className="ir-route-loading-panel" />
      <span className="ir-route-loading-caption">Abrindo página…</span>
    </div>
  );
}
