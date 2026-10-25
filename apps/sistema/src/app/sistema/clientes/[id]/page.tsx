import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientNotFoundError } from "@ir/core";
import { CLIENT_KIND_LABELS, CLIENT_ROLE_LABELS, clientDisplayName, computeReceivableDueFlag, CONTRACT_STATUS_LABELS, RECEIVABLE_SOURCE_TYPE_LABELS } from "@ir/types";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { DigitalExportControl } from "../../../../features/clientes/DigitalExportControl";
import { getClientService } from "../../../../composition/clientes";
import { getSubscriptionService } from "../../../../composition/assinaturas";
import { getContractService, getReceivableService, getClientCreditService } from "../../../../composition/financeiro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDoc(kind: "individual" | "company", value: string | undefined): string {
  if (!value) return "—";
  return kind === "individual"
    ? value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

function Field({ label, value }: { label: string; value?: string | null }): JSX.Element {
  return (
    <div className="form-field">
      <span className="field-label">{label}</span>
      <span>{value || "—"}</span>
    </div>
  );
}

export default async function ClienteDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const client = await getClientService(supabase)
    .getById(params.id)
    .catch((error: unknown) => {
      if (error instanceof ClientNotFoundError) return null;
      throw error;
    });
  if (!client) notFound();

  const isIndividual = client.kind === "individual";

  const [subscriptions, contracts, receivables, availableCredits] = await Promise.all([
    getSubscriptionService(supabase).list({ clientId: client.id }),
    getContractService(supabase).list({ clientId: client.id }),
    getReceivableService(supabase).list({ clientId: client.id }),
    getClientCreditService(supabase).list({ clientId: client.id, availableOnly: true }),
  ]);
  const [commercialReviewer, financeModule] = await Promise.all([
    supabase.rpc("staff_can_module_action",{p_module:"publicidade",p_action:"contratos_revisar"}),
    supabase.rpc("staff_can_see_module",{p_module:"financeiro"}),
  ]);
  const canSeeCommercialContracts = commercialReviewer.data === true || financeModule.data === true;
  const { data: canApproveDigital } = await supabase.rpc("is_active_admin_or_owner");
  const { data: exportPermission } = canApproveDigital === true
    ? await supabase.from("client_digital_export_permissions").select("enabled")
      .eq("client_id", client.id).maybeSingle()
    : { data: null };
  const {data:commercialPackages,error:commercialError} = canSeeCommercialContracts
    ? await supabase.from("commercial_contract_packages")
      .select("id,commercial_sale_id,status,document_mode,approved_at")
      .eq("client_id",client.id).order("created_at",{ascending:false})
    : {data:[],error:null};
  const packageIds=(commercialPackages??[]).map(pkg=>pkg.id);
  const {data:commercialDocuments,error:documentsError}=packageIds.length
    ? await supabase.from("commercial_contract_documents")
      .select("id,package_id,title,template_version,sha256,issued_at")
      .in("package_id",packageIds).order("issued_at",{ascending:false})
    : {data:[],error:null};
  const commercialDocumentIds=(commercialDocuments??[]).map(doc=>doc.id);
  const {data:commercialPreps,error:commercialPrepsError}=commercialDocumentIds.length
    ? await supabase.from("commercial_signature_preparations")
      .select("id,document_id").in("document_id",commercialDocumentIds)
    : {data:[],error:null};
  const commercialPrepIds=(commercialPreps??[]).map(prep=>prep.id);
  const {data:commercialSignatureRequests,error:signatureRequestsError}=commercialPrepIds.length
    ? await supabase.from("commercial_signature_requests")
      .select("id,preparation_id,status,completed_at")
      .in("preparation_id",commercialPrepIds)
    : {data:[],error:null};
  const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === "active").length;
  const totalOpen = receivables.filter((item) => item.status === "open" || item.status === "partially_paid").reduce((sum, item) => sum + item.balance, 0);
  const totalOverdue = receivables
    .filter((item) => computeReceivableDueFlag(item.dueDate, item.status) === "overdue")
    .reduce((sum, item) => sum + item.balance, 0);
  const totalReceived = receivables.reduce((sum, item) => sum + item.totalReceived, 0);
  const totalAvailableCredit = availableCredits.reduce((sum, item) => sum + item.balance, 0);

  return (
    <>
      <ModuleHeader
        eyebrow={`CLIENTES / ${client.reference}`}
        title={clientDisplayName(client)}
        description={CLIENT_KIND_LABELS[client.kind]}
        action={
          <div className="materias-toolbar-actions">
            <Link className="secondary-link" href={`/sistema/assinaturas/nova?clientId=${client.id}`}>
              Nova assinatura
            </Link>
            <Link className="secondary-link" href={`/sistema/financeiro/contas-a-receber/novo?clientId=${client.id}`}>
              Novo título
            </Link>
            <Link className="secondary-link" href={`/sistema/financeiro/contratos/novo?clientId=${client.id}`}>
              Novo contrato institucional
            </Link>
            <Link className="form-action-primary" href={`/sistema/clientes/${client.id}/editar`}>
              Editar
            </Link>
          </div>
        }
      />

      <section className="form-section form-section--first">
        <h2>Dados principais</h2>
        <div className="form-grid">
          <Field label="Status" value={client.status === "active" ? "Ativo" : "Inativo"} />
          {isIndividual ? (
            <>
              <Field label="Nome completo" value={client.fullName} />
              <Field label="CPF" value={formatDoc("individual", client.cpf)} />
              <Field label="Data de nascimento" value={client.birthDate ? new Date(`${client.birthDate}T00:00:00`).toLocaleDateString("pt-BR") : undefined} />
            </>
          ) : (
            <>
              <Field label="Razão social" value={client.companyName} />
              <Field label="Nome fantasia" value={client.tradeName} />
              <Field label="CNPJ" value={formatDoc("company", client.cnpj)} />
              <Field label="Inscrição estadual" value={client.stateRegistration} />
              <Field label="Responsável" value={client.responsibleName} />
              <Field label="CPF do responsável" value={formatDoc("individual", client.responsibleCpf)} />
            </>
          )}
        </div>
      </section>

      <section className="form-section">
        <h2>Contatos</h2>
        <div className="form-grid">
          <Field label="Telefone principal" value={client.phonePrimary} />
          <Field label="Telefone secundário" value={client.phoneSecondary} />
          <Field label="WhatsApp" value={client.whatsapp} />
          <Field label="E-mail" value={client.email} />
        </div>
      </section>

      <section className="form-section">
        <h2>Endereço</h2>
        <div className="form-grid">
          <Field label="CEP" value={client.address.zip} />
          <Field label="Logradouro" value={client.address.street} />
          <Field label="Número" value={client.address.number} />
          <Field label="Complemento" value={client.address.complement} />
          <Field label="Bairro" value={client.address.neighborhood} />
          <Field label="Cidade" value={client.address.city} />
          <Field label="UF" value={client.address.state} />
        </div>
      </section>

      <section className="form-section">
        <h2>Papéis</h2>
        {client.roles.length === 0 ? (
          <p className="helper-text">Nenhum papel atribuído ainda.</p>
        ) : (
          <div className="form-grid">
            {client.roles.map((role) => (
              <span key={role} className="status-pill status-pill--published">
                {CLIENT_ROLE_LABELS[role]}
              </span>
            ))}
          </div>
        )}
      </section>

      {canApproveDigital === true ? (
        <DigitalExportControl clientId={client.id}
          initiallyEnabled={exportPermission?.enabled === true}
          clientActive={client.status === "active"} />
      ) : null}

      <section className="form-section">
        <h2>Observações</h2>
        <p className="helper-text">{client.notes || "Nenhuma observação registrada."}</p>
      </section>

      <section className="form-section">
        <h2>Cadastro</h2>
        <div className="form-grid">
          <Field label="Data de cadastro" value={formatDate(client.createdAt)} />
          <Field label="Última atualização" value={formatDate(client.updatedAt)} />
        </div>
      </section>

      {/* Resumo financeiro compacto (Parte 3B, item 14) — não é um
          dashboard, só os números essenciais para dar contexto rápido
          na tela do cliente. Publicidade e histórico de relacionamento
          continuam pendentes de fases futuras. */}
      <section className="form-section form-section--compact">
        <h2>Resumo financeiro</h2>
        <div className="form-grid">
          <Field label="Total em aberto" value={formatAmount(totalOpen)} />
          <Field label="Total vencido" value={formatAmount(totalOverdue)} />
          <Field label="Total recebido" value={formatAmount(totalReceived)} />
          <Field label="Créditos disponíveis" value={formatAmount(totalAvailableCredit)} />
          <Field label="Quantidade de títulos" value={String(receivables.length)} />
          <Field label="Assinaturas ativas" value={String(activeSubscriptions)} />
          <Field label="Contratos institucionais vinculados" value={String(contracts.length)} />
        </div>
        {availableCredits.length > 0 ? (
          <ul className="helper-text" style={{ marginTop: "8px" }}>
            {availableCredits.map((credit) => (
              <li key={credit.id}>
                {formatAmount(credit.balance)} disponível — origem: {RECEIVABLE_SOURCE_TYPE_LABELS[credit.sourceType]}, criado em {formatDate(credit.createdAt)} (usado: {formatAmount(credit.totalApplied)} de {formatAmount(credit.originalAmount)})
              </li>
            ))}
          </ul>
        ) : null}
        {contracts.length > 0 ? (
          <ul className="helper-text" style={{ marginTop: "8px" }}>
            {contracts.map((contract) => (
              <li key={contract.id}>
                <Link className="materia-title-link" href={`/sistema/financeiro/contratos/${contract.id}`}>
                  {contract.reference}
                </Link>
                {" "}— {CONTRACT_STATUS_LABELS[contract.status]}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="helper-text">Os documentos comerciais emitidos são consultados na seção abaixo e não são somados aos contratos institucionais.</p>
      </section>
      {canSeeCommercialContracts ? (
        <section className="form-section">
          <h2>Contratações e documentos comerciais</h2>
          {commercialError || documentsError || commercialPrepsError || signatureRequestsError ? (
            <p role="alert" className="form-error">
              Não foi possível consultar o histórico comercial nesta sessão.
            </p>
          ) : (commercialPackages??[]).length === 0 ? (
            <p className="helper-text">Nenhuma contratação comercial vinculada a este cliente.</p>
          ) : (
            <div>
              {(commercialPackages??[]).map(pkg=>{
                const documents=(commercialDocuments??[]).filter(doc=>doc.package_id===pkg.id);
                return (
                  <div key={pkg.id} className="form-section">
                    <strong>Venda comercial · {pkg.document_mode === "combined"
                      ? "Documento único" : "Documentos por serviço"}</strong>
                    <p className="helper-text">
                      Situação: {pkg.status === "legal_approved"
                        ? "Conferência jurídica aprovada"
                        : pkg.status === "pending_legal_review"
                          ? "Pendente de revisão jurídica" : "Em preparação"}
                    </p>
                    {documents.length ? (
                      <ul className="helper-text">
                        {documents.map(doc=>{
                          const preparation=(commercialPreps??[]).find(p=>p.document_id===doc.id);
                          const request=(commercialSignatureRequests??[]).find(r=>r.preparation_id===preparation?.id);
                          return <li key={doc.id}>
                            <Link href={"/sistema/publicidade/vendas/"+pkg.commercial_sale_id+
                              "/documentos/"+doc.id}>
                              {doc.title} · versão {doc.template_version} · PDF privado
                            </Link>
                            {" "}— emitido em {formatDate(doc.issued_at)}.
                            {request?.status==="completed" ? (
                              <Link href={"/sistema/publicidade/vendas/"+pkg.commercial_sale_id+
                                "/assinaturas/"+request.id+"/documento?tipo=final"}>
                                {" "}Baixar PDF assinado por todos
                              </Link>
                            ) : request?.status==="pending" ?
                              " Assinaturas em andamento." : " Aguardando assinaturas."}
                          </li>;
                        })}
                      </ul>
                    ) : <p className="helper-text">Nenhum PDF definitivo emitido nesta contratação.</p>}
                    {commercialReviewer.data===true ? (
                      <Link className="secondary-link"
                        href={"/sistema/publicidade/vendas/"+pkg.commercial_sale_id}>
                        Abrir contratação comercial
                      </Link>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
