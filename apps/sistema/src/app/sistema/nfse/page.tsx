import Link from "next/link";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";

/**
 * Visão geral do módulo NFS-e (Parte 1) — a NFS-e é independente de
 * Contrato/Assinatura/Financeiro (ver docs/NFSE-NACIONAL-ARQUITETURA.md).
 * Esta tela só orienta pras áreas do módulo; nenhuma transmissão real
 * existe ainda.
 */
export default function NfseOverviewPage(): JSX.Element {
  return (
    <>
      <ModuleHeader
        eyebrow="NFS-e"
        title="NFS-e"
        description="Configuração fiscal, perfis de serviço e rascunhos — independente de contratos, assinaturas e financeiro."
      />

      <section className="form-section form-section--first">
        <h2>Áreas do módulo</h2>
        <div className="form-grid">
          <Link className="materia-title-link" href="/sistema/nfse/nova">Nova NFS-e</Link>
          <Link className="materia-title-link" href="/sistema/nfse/rascunhos">Rascunhos</Link>
          <Link className="materia-title-link" href="/sistema/nfse/notas">Notas emitidas</Link>
          <Link className="materia-title-link" href="/sistema/nfse/perfis-servico">Perfis de serviço</Link>
          <Link className="materia-title-link" href="/sistema/nfse/configuracoes">Configurações</Link>
        </div>
        <p className="helper-text" style={{ marginTop: "12px" }}>
          Nesta fase (Parte 1) não existe transmissão real para o Sistema Nacional — só a base do módulo (configuração do prestador, perfis de serviço e rascunhos com snapshot).
        </p>
      </section>
    </>
  );
}
