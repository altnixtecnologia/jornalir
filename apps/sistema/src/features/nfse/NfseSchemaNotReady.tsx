import Link from "next/link";
import { ModuleHeader } from "../../components/admin/ModuleHeader";
import {
  NFSE_OBSERVATIONS_MIGRATION, type NfseSchemaPreflight,
} from "../../lib/nfse/nfseSchemaPreflight";

/**
 * Interface de falha segura para rollout de código anterior à migration.
 * Não executa SQL e não permite criar rascunhos com campos descartados.
 */
export function NfseSchemaNotReady({ status }: { status: NfseSchemaPreflight }): JSX.Element {
  return (
    <>
      <ModuleHeader
        eyebrow="NFS-e / DIAGNÓSTICO"
        title="Atualização fiscal pendente"
        description="Esta etapa está suspensa até o banco de dados estar compatível com o código. Nenhuma NFS-e foi emitida."
      />
      <section className="form-section form-section--first">
        <p className="form-error" role="alert">
          {status.checkFailed
            ? "Não foi possível confirmar a estrutura do banco fiscal. Confira a conexão, as permissões e os logs do servidor."
            : "O banco fiscal ainda não contém todos os campos necessários. A preparação foi bloqueada para preservar as informações fiscais."}
        </p>
        {status.missingColumns.length > 0 && (
          <>
            <p className="helper-text">Campos identificados como pendentes:</p>
            <ul>
              {status.missingColumns.map((column) => <li key={column}><code>{column}</code></li>)}
            </ul>
          </>
        )}
        <p className="helper-text">
          A equipe técnica deve conferir a sequência de migrations já registradas no Supabase,
          realizar backup e validar a migração <code>{NFSE_OBSERVATIONS_MIGRATION}</code>
          em ambiente controlado antes de publicá-la. O sistema não a aplica automaticamente.
        </p>
        <Link href="/sistema/nfse" className="secondary-link">Voltar à NFS-e</Link>
      </section>
    </>
  );
}
