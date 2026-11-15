import Link from "next/link";
import { NFSE_ENVIRONMENT_LABELS } from "@ir/types";
import { checkHomologationReadiness } from "@ir/core";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { NFSE_PREPARATION_ACCESS_IN_THIS_RELEASE, NFSE_AVAILABLE_IN_THIS_RELEASE } from "../../../lib/release/releasePolicy";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { isLocalPreviewEnabled } from "../../../lib/auth/localPreview";
import { isRestrictedSefinEnvironment, restrictedSefinEnvironmentFromServer } from "../../../lib/nfse/restrictedSefinGate";
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
  const restricted = isRestrictedSefinEnvironment(restrictedSefinEnvironmentFromServer());
  const preparation = NFSE_PREPARATION_ACCESS_IN_THIS_RELEASE && !NFSE_AVAILABLE_IN_THIS_RELEASE && !preview && !restricted;

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
  const environmentLabel = preparation ? "Preparação — SEM EMISSÃO" : issuerConfig ? NFSE_ENVIRONMENT_LABELS[issuerConfig.environment] : "Não configurado";

  // A implantação mostra apenas dados que existem no banco: nunca considera
  // um certificado A1 válido por metadados manuais/legados do formulário.
  const certificateReady = Boolean(activeCertificate) && !readiness.missing.some((item) => /certificado/i.test(item));
  const setupSteps = [
    {
      title: "Cadastrar prestador",
      description: issuerConfig ? "Cadastro localizado. Confira município, regime e série da DPS." : "Informe os dados fiscais do Jornal IR e confirme o regime tributário.",
      done: Boolean(issuerConfig),
      href: "/sistema/nfse/configuracoes",
      action: "Abrir configurações",
    },
    {
      title: "Definir perfis de serviço",
      description: serviceProfiles.some((profile) => Boolean(profile.cTribNac?.trim()))
        ? "Existe perfil ativo com código de tributação nacional. Revise seus parâmetros."
        : "Cadastre ao menos um serviço com o código nacional confirmado.",
      done: serviceProfiles.some((profile) => Boolean(profile.cTribNac?.trim())),
      href: "/sistema/nfse/perfis-servico",
      action: "Abrir perfis",
    },
    {
      title: "Validar o certificado A1",
      description: certificateReady
        ? "Certificado ativo e válido no diagnóstico atual. Ainda não autoriza transmissão."
        : "A1 pendente ou inválido. Use o carregamento seguro e confira a validade/CNPJ.",
      done: certificateReady,
      href: "/sistema/nfse/configuracoes",
      action: "Conferir certificado",
    },
    {
      title: "Preparar o primeiro rascunho",
      description: drafts.length > 0
        ? "Já existe rascunho para conferência. Nenhuma NFS-e foi emitida por esta etapa."
        : "Escolha um cliente existente e confira tomador, serviço, competência e valor.",
      done: drafts.length > 0,
      href: drafts.length > 0 ? "/sistema/nfse/rascunhos" : "/sistema/nfse/nova",
      action: drafts.length > 0 ? "Ver rascunhos" : "Criar rascunho",
    },
  ];
  const completedSetupSteps = setupSteps.filter((step) => step.done).length;

  return (
    <>
      <ModuleHeader
        eyebrow="NFS-e"
        title="NFS-e"
        description={preparation ? "Preparação e rascunhos para testes internos — nenhuma nota será transmitida à SEFIN." : "Configuração fiscal, perfis de serviço e rascunhos — independente de contratos, assinaturas e financeiro."}
        action={
          <div className="form-actions">
            <span className={`status-pill ${preview || restricted || preparation ? "status-pill--adjusting" : "status-pill--published"}`}>
              Ambiente: {preview ? "Demonstração local" : restricted ? "Produção Restrita (TESTE)" : environmentLabel}
            </span>
            <Link className="form-action-primary" href="/sistema/nfse/nova">+ Novo rascunho</Link>
          </div>
        }
      />

      <ul className="quick-access-grid financeiro-kpi-grid">
        <Tile label="Rascunhos" value={String(drafts.length)} href="/sistema/nfse/rascunhos" />
        <Tile label="Notas emitidas" value={String(notes.length)} href="/sistema/nfse/notas" />
        <Tile label="Valor total emitido" value={formatAmount(totalIssuedValue)} href="/sistema/nfse/notas" />
        <Tile label="Perfis de serviço ativos" value={String(serviceProfiles.length)} href="/sistema/nfse/perfis-servico" />
      </ul>

      <section className="form-section" aria-labelledby="nfse-setup-title">
        <h2 id="nfse-setup-title">Implantação do módulo — {completedSetupSteps} de {setupSteps.length} etapas</h2>
        <p className="helper-text">
          Comece pelos cadastros reais, sem simular notas nem configurar dados fiscais automaticamente.
          Os indicadores mostram apenas registros encontrados e não significam aprovação para emissão.
        </p>
        <ol style={{ paddingLeft: "22px", marginTop: "12px" }}>
          {setupSteps.map((step) => (
            <li key={step.title} style={{ marginBottom: "16px" }}>
              <div className="form-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <strong>{step.title}</strong>
                <span className={step.done ? "status-pill status-pill--published" : "status-pill status-pill--adjusting"}>
                  {step.done ? "Cadastrado" : "Pendente"}
                </span>
              </div>
              <p className="helper-text">{step.description}</p>
              <Link className="secondary-link" href={step.href}>{step.action}</Link>
            </li>
          ))}
        </ol>
        <p className="helper-text" role="status">
          A emissão fiscal, os envios e o DANFSe definitivo permanecem bloqueados independentemente
          do andamento destas quatro etapas. A homologação nacional é uma fase separada.
        </p>
      </section>

      <section className="form-section">
        <h2>Áreas do módulo</h2>
        <div className="form-grid">
          <Link className="materia-title-link" href="/sistema/nfse/rascunhos">Rascunhos</Link>
          <Link className="materia-title-link" href="/sistema/nfse/notas">Notas emitidas</Link>
          <Link className="materia-title-link" href="/sistema/nfse/perfis-servico">Perfis de serviço</Link>
          <Link className="materia-title-link" href="/sistema/nfse/configuracoes">Configurações</Link>
        </div>
        <p className="helper-text" style={{ marginTop: "16px" }}>
          Quer conferir o documento antes de ter certificado A1?{" "}
          <Link className="secondary-link" href="/sistema/nfse/previa-danfse" target="_blank" rel="noopener noreferrer">
            Abrir prévia fictícia do DANFSe (PDF)
          </Link>
          {" "}— usa dados inventados, não cria nota, não transmite à SEFIN e tem aviso de SEM VALIDADE JURÍDICA.
        </p>
        <p className="helper-text" style={{ marginTop: "12px" }}>
          {preview
            ? "Modo demonstração: nenhuma transmissão fiscal real é realizada."
            : restricted
              ? "Ambiente isolado de Produção Restrita: o envio de teste à SEFIN depende do A1 e de validação fiscal prévia. Não há comunicação com a produção nacional."
              : "A emissão oficial continua BLOQUEADA nesta instalação, mesmo que a configuração fiscal já esteja cadastrada."}
        </p>
      </section>

      <section className="form-section">
        <h2>Conferência para emissão nacional</h2>
        <p className="helper-text">
          Nenhum imposto, alíquota ou parâmetro municipal é presumido automaticamente. A validação do XML assinado
          contra o XSD acontece imediatamente antes do envio de teste e não pode ser dispensada.
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
