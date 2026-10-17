import Link from "next/link";
import { NFSE_ENVIRONMENT_LABELS } from "@ir/types";
import { checkHomologationReadiness } from "@ir/core";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { isLocalPreviewEnabled } from "../../../lib/auth/localPreview";
import { getDraftService, getIssuerConfigService, getServiceProfileService, getCertificateService } from "../../../composition/nfse";
import { createIssuedNoteRepositorySupabase } from "../../../providers/supabase/nfseIssuedNoteRepository.supabase";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Tile({ label, value, href }: { label: string; value: string; href?: string }): JSX.Element {
  const content = (
    <>
      <span className="quick-access-label">{value}</span>
      <span className="quick-access-description">{label}</span>
    </>
  );
  if (href) {
    return (
      <li>
        <Link className="quick-access-card" href={href}>
          {content}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <div className="quick-access-card" style={{ cursor: "default" }}>
        {content}
      </div>
    </li>
  );
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Visão geral do módulo NFS-e (Parte 1) — a NFS-e é independente de
 * Contrato/Assinatura/Financeiro (ver docs/NFSE-NACIONAL-ARQUITETURA.md).
 * KPIs abaixo só vêm de contagens/somas reais (rascunhos/notas/perfis
 * já carregados por cada tela própria) — nunca um número inventado.
 */
export default async function NfseOverviewPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const preview = isLocalPreviewEnabled();

  const [drafts, notes, serviceProfiles, issuerConfig] = await Promise.all([
    getDraftService(supabase).list(),
    createIssuedNoteRepositorySupabase(supabase).listAll(),
    getServiceProfileService(supabase).list({ activeOnly: true }),
    getIssuerConfigService(supabase).getCurrent(),
  ]);

  const activeCertificate = issuerConfig ? await getCertificateService().getActiveInfo(issuerConfig.id) : null;
  const readiness = checkHomologationReadiness({
    issuerConfig,
    activeCertificate,
    cTribNacConfigured: serviceProfiles.some((profile) => Boolean(profile.cTribNac?.trim())),
    lastXsdValidationValid: null, // Só é verdadeiro após validar um XML real daquele rascunho.
  });
  const totalIssuedValue = notes.reduce((sum, note) => sum + note.serviceValue, 0);
  // Aviso de "isto é preview" já vem do banner global (AdminShell) — nunca
  // duplicado aqui; este badge mostra só o ambiente fiscal configurado.
  const environmentLabel = issuerConfig ? NFSE_ENVIRONMENT_LABELS[issuerConfig.environment] : "Não configurado";

  return (
    <>
      <ModuleHeader
        eyebrow="NFS-e"
        title="NFS-e"
        description="Configuração fiscal, perfis de serviço e rascunhos — independente de contratos, assinaturas e financeiro."
        action={
          <div className="form-actions">
            <span className={`status-pill ${preview ? "status-pill--adjusting" : "status-pill--published"}`}>
              Ambiente: {environmentLabel}
            </span>
            <Link className="form-action-primary" href="/sistema/nfse/nova">+ Nova NFS-e</Link>
          </div>
        }
      />

      <ul className="quick-access-grid financeiro-kpi-grid">
        <Tile label="Rascunhos" value={String(drafts.length)} href="/sistema/nfse/rascunhos" />
        <Tile label="Notas emitidas" value={String(notes.length)} href="/sistema/nfse/notas" />
        <Tile label="Valor total emitido" value={formatAmount(totalIssuedValue)} href="/sistema/nfse/notas" />
        <Tile label="Perfis de serviço ativos" value={String(serviceProfiles.length)} href="/sistema/nfse/perfis-servico" />
      </ul>

      <section className="form-section">
        <h2>Áreas do módulo</h2>
        <div className="form-grid">
          <Link className="materia-title-link" href="/sistema/nfse/rascunhos">Rascunhos</Link>
          <Link className="materia-title-link" href="/sistema/nfse/notas">Notas emitidas</Link>
          <Link className="materia-title-link" href="/sistema/nfse/perfis-servico">Perfis de serviço</Link>
          <Link className="materia-title-link" href="/sistema/nfse/configuracoes">Configurações</Link>
        </div>
        <p className="helper-text" style={{ marginTop: "12px" }}>
          {preview
            ? "Modo demonstração: nenhuma transmissão fiscal real é realizada."
            : "A configuração fiscal e os rascunhos são reais, mas a transmissão ao Sistema Nacional permanece tecnicamente bloqueada até a validação integral da integração."}
        </p>
      </section>

      <section className="form-section">
        <h2>Conferência para emissão nacional</h2>
        <p className="helper-text">
          O botão de emissão não autoriza nenhuma NFS-e enquanto houver pendências ou o provedor nacional estiver bloqueado.
          Nenhum imposto, alíquota ou parâmetro municipal é presumido automaticamente.
        </p>
        {readiness.missing.length ? (
          <ul style={{ paddingLeft: "22px" }}>
            {readiness.missing.map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : (
          <p className="helper-text">Pré-requisitos internos completos, mas a integração oficial ainda exige homologação do provedor.</p>
        )}
        <div className="form-actions">
          <Link className="secondary-link" href="/sistema/nfse/configuracoes">Configurar prestador e certificado</Link>
          <Link className="secondary-link" href="/sistema/nfse/perfis-servico">Conferir perfis de serviço</Link>
        </div>
      </section>
    </>
  );
}
