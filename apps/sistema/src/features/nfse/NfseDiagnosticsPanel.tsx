interface NfseDiagnosticsPanelProps {
  masterKeyConfigured: boolean;
  supabaseAdminConfigured: boolean;
  environmentLabel: string;
  productionBlocked: boolean;
}

/**
 * Diagnóstico de configuração server-side (Parte 2B/2C) — nunca recebe
 * nem exibe o valor de nenhum segredo, só booleans já calculados pelo
 * Server Component chamador (ver `isSecretStoreConfigured`/
 * `hasServiceRoleKey`). Mostrado antes do certificado/parametrização
 * pra diagnosticar rápido "falta configurar algo" sem precisar tentar
 * um upload ou uma consulta real primeiro.
 */
export function NfseDiagnosticsPanel({
  masterKeyConfigured,
  supabaseAdminConfigured,
  environmentLabel,
  productionBlocked,
}: NfseDiagnosticsPanelProps): JSX.Element {
  return (
    <section className="form-section form-section--first">
      <h2>Diagnóstico de configuração</h2>
      <div className="form-grid">
        <div className="form-field">
          <span className="field-label">Configuração criptográfica</span>
          <span>{masterKeyConfigured ? "OK" : "ausente"}</span>
          <span className="helper-text">NFSE_CERTIFICATE_MASTER_KEY presente e com 32 bytes válidos.</span>
        </div>
        <div className="form-field">
          <span className="field-label">Backend Supabase</span>
          <span>{supabaseAdminConfigured ? "OK" : "ausente"}</span>
          <span className="helper-text">SUPABASE_SERVICE_ROLE_KEY disponível para operações server-side.</span>
        </div>
        <div className="form-field">
          <span className="field-label">Ambiente fiscal</span>
          <span>{environmentLabel}</span>
          <span className="helper-text">{productionBlocked ? "Produção permanece bloqueada." : "Produção habilitada."}</span>
        </div>
      </div>
    </section>
  );
}
