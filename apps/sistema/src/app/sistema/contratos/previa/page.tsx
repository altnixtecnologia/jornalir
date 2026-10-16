import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { clientDisplayName } from "@ir/types";
import type { Client } from "@ir/types";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getClientService } from "../../../../composition/clientes";
import { getSubscriptionService } from "../../../../composition/assinaturas";
import { getCommercialSaleService } from "../../../../composition/comercial";
import {
  CONTRACT_TEMPLATE_LABELS, CONTRACT_TEMPLATE_VERSIONS,
  DRAFT_CONTRACT_SETTINGS, formatContractMoney, formatContractDate,
  identifyContractKind, legalText, normalizeContractSettings,
  type ContractTemplateKind,
} from "../../../../lib/contracts/contractTemplates";
import { PrintButton } from "../../../../features/financeiro/PrintButton";
import styles from "./preview.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Origin = "solicitacao" | "assinatura" | "venda";
interface ContractPreviewData {
  origin: Origin;
  reference: string;
  clientName: string;
  clientDocument: string;
  representative: string;
  contact: string;
  address: string;
  template: ContractTemplateKind;
  items: string[];
  period: string;
  total: number | null;
  payment: string;
  notes: string;
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function displayAddress(parts: Array<string | null | undefined>): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(", ") || "Endereço não informado";
}
function clientFields(client: Client) {
  return {
    clientName: client.kind === "company" ? client.companyName || clientDisplayName(client) : clientDisplayName(client),
    clientDocument: client.kind === "company" ? client.cnpj || "CNPJ não informado" : client.cpf || "CPF não informado",
    representative: client.kind === "company" ? client.responsibleName || "Representante não informado" : "",
    contact: [client.email, client.whatsapp || client.phonePrimary].filter(Boolean).join(" · "),
    address: displayAddress([client.address.street, client.address.number, client.address.complement,
      client.address.neighborhood, client.address.city, client.address.state, client.address.zip]),
  };
}
function requestItems(selection: unknown): string[] {
  if (!Array.isArray(selection)) return [];
  return selection.filter((item) => item && typeof item === "object").map((entry) => {
    const item = entry as Record<string, unknown>;
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const kind = typeof item.type === "string" ? item.type.trim() : "";
    return (label || kind || "Serviço solicitado").slice(0, 240);
  }).slice(0, 24);
}
function chooseRequestTemplate(requestType: string, items: string[]): ContractTemplateKind {
  if (requestType === "mixed" || items.length > 1) return "mixed";
  if (requestType === "subscription") return "annual_print";
  return identifyContractKind(items[0] || "");
}
function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ContractPreviewPage({ searchParams }: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const origin = one(searchParams?.origem) as Origin;
  const id = one(searchParams?.id);
  if (!UUID.test(id) || !["solicitacao", "assinatura", "venda"].includes(origin)) notFound();
  const db = createSupabaseServerClient();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) redirect("/login");
  const { data: profile } = await db.from("profiles").select("role,active").eq("id", auth.user.id).maybeSingle();
  if (!profile?.active) redirect("/login?erro=inativo");
  const moduleKey = origin === "assinatura" ? "assinaturas" : "publicidade";
  if (profile.role === "operator") {
    const permission = await db.rpc("staff_can_see_module", { p_module: moduleKey });
    if (permission.error || permission.data !== true) redirect("/sistema?acesso=negado");
  }

  let draft: ContractPreviewData;
  let back: string;
  if (origin === "solicitacao") {
    const { data: request, error } = await db.from("site_interest_requests")
      .select("id,request_type,name,phone,email,company,document_number,selections,estimated_total,approved_total,availability_status,status,address_zip,address_street,address_number,address_complement,address_neighborhood,address_city,address_state,payment_preference,notes,admin_note")
      .eq("id", id).maybeSingle();
    if (error || !request || request.availability_status !== "approved" || request.status === "discarded") notFound();
    const items = requestItems(request.selections);
    draft = {
      origin, reference: "Solicitação " + id.slice(0, 8).toUpperCase(),
      clientName: request.company || request.name,
      clientDocument: request.document_number || "Documento não informado",
      representative: request.company ? request.name : "",
      contact: [request.email, request.phone].filter(Boolean).join(" · "),
      address: displayAddress([request.address_street, request.address_number, request.address_complement,
        request.address_neighborhood, request.address_city, request.address_state, request.address_zip]),
      template: chooseRequestTemplate(request.request_type, items),
      items: items.length ? items : ["Serviços solicitados — detalhamento a conferir"],
      period: "Datas de vigência e veiculação a confirmar na contratação",
      total: request.approved_total !== null ? Number(request.approved_total) : null,
      payment: String(request.payment_preference ?? "A definir"),
      notes: String(request.notes ?? ""),
    };
    back = "/sistema/publicidade/solicitacoes";
  } else if (origin === "assinatura") {
    const subscription = await getSubscriptionService(db).getById(id).catch(() => null);
    if (!subscription || subscription.serviceType !== "impresso" || subscription.periodicity !== "annual") notFound();
    const client = await getClientService(db).getById(subscription.clientId).catch(() => null);
    if (!client) notFound();
    draft = {
      origin, reference: subscription.reference, ...clientFields(client),
      template: "annual_print",
      items: ["Assinatura anual do jornal impresso",
        "Exemplares por edição: " + String(subscription.print?.copies ?? "A confirmar"),
        "Entrega: " + displayAddress([subscription.print?.addressStreet, subscription.print?.addressNumber,
          subscription.print?.addressComplement, subscription.print?.addressNeighborhood,
          subscription.print?.addressCity, subscription.print?.addressState, subscription.print?.addressZip])],
      period: formatContractDate(subscription.startsAt) + " até " + formatContractDate(subscription.endsAt),
      total: subscription.amount,
      payment: "Periodicidade anual; vencimento: " + formatContractDate(subscription.nextDueDate),
      notes: subscription.notes || "",
    };
    back = "/sistema/assinaturas/" + id;
  } else {
    const sale = await getCommercialSaleService(db).getById(id).catch(() => null);
    if (!sale || sale.status === "cancelled") notFound();
    const client = await getClientService(db).getById(sale.clientId).catch(() => null);
    if (!client) notFound();
    draft = {
      origin, reference: sale.reference, ...clientFields(client),
      template: identifyContractKind(sale.channel),
      items: [sale.channel + " — " + sale.description],
      period: formatContractDate(sale.startDate) + " até " + formatContractDate(sale.endDate),
      total: sale.amount,
      payment: sale.commercialCondition === "installments"
        ? "Parcelado em " + sale.installmentsCount + " vezes"
        : sale.commercialCondition === "cash" ? "À vista" : sale.commercialCondition,
      notes: sale.notes || "",
    };
    back = "/sistema/publicidade/vendas/" + id;
  }

  // Configurações publicamente não acessíveis; somente sessão de staff ativa.
  const { data: stored, error: settingsError } = await db.from("contract_document_settings")
    .select("*").eq("id", 1).maybeSingle();
  const issuer = settingsError ? { ...DRAFT_CONTRACT_SETTINGS } :
    normalizeContractSettings(stored as Record<string, unknown> | null);
  const missing = [
    ...(!issuer.legalName ? ["razão social do Jornal"] : []),
    ...(!issuer.cnpj ? ["CNPJ do Jornal"] : []),
    ...(!issuer.representative ? ["representante legal"] : []),
    ...(draft.clientDocument.includes("não informado") ? ["CPF/CNPJ do cliente"] : []),
    ...(draft.total === null ? ["valor negociado"] : []),
  ];
  return (
    <div className={styles.workspace}>
      <div className={styles.toolbar}>
        <Link href={back} className="secondary-link">← Voltar ao cadastro</Link>
        <span className={styles.notice}>MINUTA NÃO ASSINÁVEL</span>
        <PrintButton />
        <button disabled title="Disponível somente após homologação jurídica e técnica">Enviar WhatsApp (em preparação)</button>
      </div>
      <div className={styles.document}>
        <header className={styles.heading}>
          <img src="/brand/logo-escrita.png" alt="Informativo Regional" className={styles.logo} />
          <div className={styles.identity}>
            <strong>{issuer.legalName || issuer.tradeName}</strong>
            <p>{issuer.cnpj ? "CNPJ: " + issuer.cnpj : "CNPJ a confirmar"}</p>
            <p>{issuer.address}</p>
            <p>{issuer.phone} · {issuer.email}</p>
          </div>
        </header>
        <div className={styles.draftBanner}>MINUTA PARA CONFERÊNCIA — NÃO ENVIAR AO CLIENTE</div>
        <h1 className={styles.title}>{CONTRACT_TEMPLATE_LABELS[draft.template]}</h1>
        <p className={styles.meta}>Modelo {CONTRACT_TEMPLATE_VERSIONS[draft.template]} · Origem: {draft.reference}</p>
        {settingsError ? <p className={styles.warning}>Configuração contratual aguardando homologação do banco.</p> : null}
        {missing.length ? <p className={styles.warning}>Antes de concluir, confira: {missing.join("; ")}.</p> : null}
        <section className={styles.section}>
          <h2>1. Partes</h2>
          <p><strong>Contratada (prestadora):</strong> {issuer.legalName || "Razão social a confirmar"}, CNPJ {issuer.cnpj || "a confirmar"}, representada por {issuer.representative || "representante a definir"}.</p>
          <p><strong>Contratante (cliente):</strong> {draft.clientName}, documento {draft.clientDocument}{draft.representative ? ", representada por " + draft.representative : ""}.</p>
          <p><strong>Contato:</strong> {draft.contact || "Não informado"}.</p>
          <p><strong>Endereço:</strong> {draft.address}.</p>
        </section>
        <section className={styles.section}>
          <h2>2. Serviços contratados</h2>
          <ul>{draft.items.map((item, index) => <li key={index}>{item}</li>)}</ul>
          <p><strong>Período:</strong> {draft.period}.</p>
        </section>
        <section className={styles.section}>
          <h2>3. Preço e pagamento</h2>
          <p><strong>Valor:</strong> {formatContractMoney(draft.total)}.</p>
          <p><strong>Condição:</strong> {draft.payment}.</p>
        </section>
        <section className={styles.section}>
          <h2>4. Condições do serviço — texto provisório</h2>
          <p>{legalText(issuer, draft.template)}</p>
          {draft.notes ? <p><strong>Observações do cadastro:</strong> {draft.notes}</p> : null}
          <p className={styles.warning}>Cláusulas pendentes de revisão jurídica; não há assinatura ou cobrança automatizada neste documento.</p>
        </section>
        <section className={styles.section}>
          <h2>5. Assinaturas — espaços ilustrativos</h2>
          <div className={styles.signatures}>
            <div>________________________________<span>Representante do Informativo Regional</span></div>
            <div>________________________________<span>Contratante / representante</span></div>
          </div>
        </section>
      </div>
      <div className={styles.bottom}>
        <p>Os dados foram preenchidos automaticamente a partir do cadastro. Confira antes de prosseguir. O envio permanece desativado até a integração de assinatura ser auditada e os modelos aprovados.</p>
        <Link href={back}>Voltar e corrigir informações</Link>
      </div>
    </div>
  );
}
