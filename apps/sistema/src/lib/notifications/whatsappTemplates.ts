/**
 * Catálogo de templates de WhatsApp ao cliente (Meta) e configuração do despacho automático.
 *
 * Regras:
 *  - só se usa template JÁ APROVADO pela Meta: o nome aprovado vem de variável de ambiente; sem a
 *    variável o evento permanece DESLIGADO (nada é enfileirado nem enviado). Nunca texto livre;
 *  - templates existentes só são reaproveitados quando finalidade e parâmetros coincidem
 *    (`fatura_disponivel`, `confirmacao_pagamento_ir`); os demais abaixo são PROPOSTAS a aprovar
 *    (não foram submetidos à Meta);
 *  - o despacho automático só liga com produção + chave mestra + classificação dos títulos de teste
 *    concluída + data de início (eventos anteriores à data nunca disparam).
 */
export type AutomaticEvent = "new_obligation" | "due_soon" | "overdue" | "receipt_available" | "service_suspended" | "service_restored";
export type ManualEvent = "manual_billing" | "manual_confirmation" | "manual_receipt";
export type NotificationEvent = AutomaticEvent | ManualEvent;

export type TemplateDefinition = {
  event: NotificationEvent;
  /** Variável de ambiente com o NOME APROVADO do template. */
  envVar: string;
  /** Nome sugerido para submissão à Meta (categoria UTILITY, idioma pt_BR). */
  proposedName: string;
  /** Já aprovado e em uso no projeto? */
  existingApproved: boolean;
  body: string;
  parameters: string[];
  purpose: string;
};

export const TEMPLATE_DEFINITIONS: Record<NotificationEvent, TemplateDefinition> = {
  new_obligation: {
    event: "new_obligation", envVar: "WHATSAPP_TEMPLATE_NEW_OBLIGATION", proposedName: "nova_cobranca_ir", existingApproved: false,
    body: "Olá, {{1}}. Há uma nova cobrança referente a {{2}}, no valor de {{3}}, com vencimento em {{4}}. Você pode consultar e pagar pelo portal do cliente. Jornal Informativo Regional.",
    parameters: ["nome do cliente", "referência da cobrança", "valor", "vencimento (dd/mm/aaaa)"],
    purpose: "Nova obrigação financeira registrada no Jornal IR.",
  },
  due_soon: {
    event: "due_soon", envVar: "WHATSAPP_TEMPLATE_DUE_SOON", proposedName: "lembrete_vencimento_ir", existingApproved: false,
    body: "Olá, {{1}}. Lembrete: a cobrança referente a {{2}}, no valor de {{3}}, vence em {{4}}. Consulte e pague pelo portal do cliente. Jornal Informativo Regional.",
    parameters: ["nome do cliente", "referência da cobrança", "valor", "vencimento (dd/mm/aaaa)"],
    purpose: "Vencimento próximo (antecedência configurável).",
  },
  overdue: {
    event: "overdue", envVar: "WHATSAPP_TEMPLATE_OVERDUE", proposedName: "cobranca_em_atraso_ir", existingApproved: false,
    body: "Olá, {{1}}. Não identificamos o pagamento da cobrança referente a {{2}}, no valor de {{3}}, vencida em {{4}}. Se já pagou, desconsidere esta mensagem. Para regularizar, acesse o portal do cliente. Jornal Informativo Regional.",
    parameters: ["nome do cliente", "referência da cobrança", "valor", "vencimento (dd/mm/aaaa)"],
    purpose: "Pagamento em atraso (dias de atraso configuráveis, uma vez por marco).",
  },
  receipt_available: {
    event: "receipt_available", envVar: "WHATSAPP_TEMPLATE_RECEIPT_AVAILABLE", proposedName: "recibo_disponivel_ir", existingApproved: false,
    body: "Olá, {{1}}. O recibo do pagamento de {{3}} referente a {{2}} já está disponível no portal do cliente: {{4}}. Jornal Informativo Regional.",
    parameters: ["nome do cliente", "referência da cobrança", "valor pago", "endereço do portal do cliente"],
    purpose: "Recibo existente e autorizado disponível no portal (também usada no envio manual de recibo).",
  },
  service_suspended: {
    event: "service_suspended", envVar: "WHATSAPP_TEMPLATE_SERVICE_SUSPENDED", proposedName: "servico_suspenso_ir", existingApproved: false,
    body: "Olá, {{1}}. Por pendência financeira, a exibição da sua campanha nas telas do Informativo Regional foi suspensa. Regularize o pagamento pelo portal do cliente para restabelecer o serviço. Jornal Informativo Regional.",
    parameters: ["nome do cliente"],
    purpose: "Suspensão financeira EFETIVA (confirmada pelo Informativo).",
  },
  service_restored: {
    event: "service_restored", envVar: "WHATSAPP_TEMPLATE_SERVICE_RESTORED", proposedName: "servico_restabelecido_ir", existingApproved: false,
    body: "Olá, {{1}}. Recebemos a regularização e a exibição da sua campanha nas telas do Informativo Regional foi restabelecida. Obrigado! Jornal Informativo Regional.",
    parameters: ["nome do cliente"],
    purpose: "Restabelecimento EFETIVO (confirmado pelo Informativo).",
  },
  manual_billing: {
    event: "manual_billing", envVar: "WHATSAPP_BILLING_TEMPLATE", proposedName: "fatura_disponivel", existingApproved: true,
    body: "Template existente `fatura_disponivel` (nome, referência, valor, vencimento, link do Pix).",
    parameters: ["nome do cliente", "referência da cobrança", "valor", "vencimento (dd/mm/aaaa)", "link seguro do Pix"],
    purpose: "Cobrança manual com Pix vigente (nunca cria cobrança).",
  },
  manual_confirmation: {
    event: "manual_confirmation", envVar: "WHATSAPP_PAYMENT_CONFIRMED_TEMPLATE", proposedName: "confirmacao_pagamento_ir", existingApproved: true,
    body: "Template existente `confirmacao_pagamento_ir` (nome, referência, valor, forma, transação).",
    parameters: ["nome do cliente", "referência da cobrança", "valor", "forma de pagamento", "identificador da transação"],
    purpose: "Confirmação de pagamento (manual ou automática pelo webhook).",
  },
  manual_receipt: {
    event: "manual_receipt", envVar: "WHATSAPP_TEMPLATE_RECEIPT_AVAILABLE", proposedName: "recibo_disponivel_ir", existingApproved: false,
    body: "Mesmo template de `receipt_available`.",
    parameters: ["nome do cliente", "referência da cobrança", "valor pago", "endereço do portal do cliente"],
    purpose: "Aviso manual de recibo existente.",
  },
};

/** Nome APROVADO configurado ou null (evento desligado). Padrões só existem para os templates já aprovados. */
export function approvedTemplateName(event: NotificationEvent, env: Record<string, string | undefined>): string | null {
  const definition = TEMPLATE_DEFINITIONS[event];
  const configured = (env[definition.envVar] ?? "").trim();
  if (configured) return configured;
  return definition.existingApproved && (event === "manual_billing" || event === "manual_confirmation") ? definition.proposedName : null;
}

// --- Configuração do despacho automático ------------------------------------------------------------------
export type NotificationConfig = {
  enabled: boolean;
  /** Eventos anteriores a esta data (aaaa-mm-dd) nunca disparam. */
  since: string | null;
  dueSoonDays: number;
  overdueOffsets: number[];
  templates: Record<AutomaticEvent, string | null>;
  portalUrl: string;
  batchLimit: number;
  /** Orçamento de tempo do ciclo (ms), abaixo do limite da função. */
  budgetMs: number;
};

const AUTOMATIC_EVENTS: AutomaticEvent[] = ["new_obligation", "due_soon", "overdue", "receipt_available", "service_suspended", "service_restored"];

function boundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

export function readNotificationConfig(env: Record<string, string | undefined>): NotificationConfig {
  const since = /^\d{4}-\d{2}-\d{2}$/.test(env.WHATSAPP_FINANCE_NOTIFICATIONS_SINCE ?? "") && !Number.isNaN(Date.parse(env.WHATSAPP_FINANCE_NOTIFICATIONS_SINCE + "T00:00:00Z"))
    ? env.WHATSAPP_FINANCE_NOTIFICATIONS_SINCE! : null;
  const offsets = [...new Set((env.WHATSAPP_OVERDUE_REMINDER_DAYS ?? "1").split(/[\s,;]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 60))].slice(0, 3);
  const templates = Object.fromEntries(AUTOMATIC_EVENTS.map((event) => {
    const name = approvedTemplateName(event, env);
    // Aviso de recibo só liga com o portal efetivamente oferecendo recibo ao cliente.
    const blocked = event === "receipt_available" && env.WHATSAPP_RECEIPT_PORTAL_READY !== "true";
    return [event, blocked ? null : name];
  })) as Record<AutomaticEvent, string | null>;
  return {
    enabled: env.VERCEL_ENV === "production"
      && env.WHATSAPP_AUTOMATIC_FINANCE_ENABLED === "true"
      && env.JORNALIR_NOTIFICATION_TEST_CLASSIFICATION_DONE === "true"
      && since !== null && Object.values(templates).some(Boolean),
    since,
    dueSoonDays: boundedInt(env.WHATSAPP_DUE_SOON_DAYS, 3, 1, 15),
    overdueOffsets: offsets.length ? offsets : [1],
    templates,
    portalUrl: (env.WHATSAPP_PORTAL_URL ?? "https://cliente.altnix.com.br").trim().replace(/\/$/, ""),
    batchLimit: boundedInt(env.WHATSAPP_NOTIFICATION_BATCH_LIMIT, 25, 1, 100),
    budgetMs: boundedInt(env.WHATSAPP_NOTIFICATION_BUDGET_MS, 40000, 5000, 50000),
  };
}

// --- Parâmetros ------------------------------------------------------------------------------------------------
/** A Meta recusa parâmetros com quebra de linha, tabulação ou 5+ espaços seguidos. */
export function sanitizeTemplateParam(value: string, max = 200): string {
  const clean = value.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return (clean.length > max ? clean.slice(0, max - 1) + "…" : clean) || "-";
}

export const brl = (amount: number) => amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const brDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
export const firstName = (name: string) => (name.trim().split(/\s+/)[0] || "Cliente");

export type ParamContext = {
  name: string; reference?: string; amount?: number; dueDate?: string;
  portalUrl?: string; paymentUrl?: string; methodLabel?: string; transactionId?: string;
};

/** Parâmetros na ORDEM aprovada de cada template; nunca inclui dado interno nem identificador do Jornal. */
export function buildTemplateParams(event: NotificationEvent, ctx: ParamContext): string[] {
  const s = (v: string | undefined, max?: number) => sanitizeTemplateParam(v ?? "", max);
  const name = s(firstName(ctx.name), 60);
  switch (event) {
    case "new_obligation":
    case "due_soon":
    case "overdue":
      return [name, s(ctx.reference), brl(ctx.amount ?? 0), ctx.dueDate ? brDate(ctx.dueDate) : "-"];
    case "receipt_available":
    case "manual_receipt":
      return [name, s(ctx.reference), brl(ctx.amount ?? 0), s(ctx.portalUrl, 120)];
    case "service_suspended":
    case "service_restored":
      return [name];
    case "manual_billing":
      return [name, s(ctx.reference), brl(ctx.amount ?? 0), ctx.dueDate ? brDate(ctx.dueDate) : "-", s(ctx.paymentUrl, 160)];
    case "manual_confirmation":
      return [name, s(ctx.reference), brl(ctx.amount ?? 0), s(ctx.methodLabel, 40), s(ctx.transactionId, 80)];
  }
}

/** Quantidade de parâmetros esperada por template (proteção contra divergência com a definição aprovada). */
export const EXPECTED_PARAM_COUNT: Record<NotificationEvent, number> = Object.fromEntries(
  (Object.keys(TEMPLATE_DEFINITIONS) as NotificationEvent[]).map((event) => [event, TEMPLATE_DEFINITIONS[event].parameters.length]),
) as Record<NotificationEvent, number>;
