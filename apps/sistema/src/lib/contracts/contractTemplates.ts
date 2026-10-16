import "server-only";

export type ContractTemplateKind = "annual_print" | "print_ad" | "led_ad" | "mixed";
export type ContractSettings = {
  legalName: string;
  tradeName: string;
  cnpj: string;
  representative: string;
  address: string;
  phone: string;
  email: string;
  annualText: string;
  printText: string;
  ledText: string;
  mixedText: string;
};

export const DRAFT_CONTRACT_SETTINGS: ContractSettings = {
  // Razão social/CNPJ não podem ser inferidos de marca, domínio ou endereço.
  legalName: "",
  tradeName: "Informativo Regional",
  cnpj: "",
  representative: "",
  address: "Rua Joaquim Pereira Maciel, 256, Centro, São João do Sul/SC",
  phone: "(48) 98829-7503",
  email: "contato@informativoregional.net",
  annualText: "Objeto: fornecimento periódico do Jornal Informativo Regional, na quantidade e no endereço discriminados acima. A vigência, cobrança, condições de entrega, atraso, alteração de endereço, rescisão e demais direitos serão definidos na versão jurídica aprovada deste modelo.",
  printText: "Objeto: contratação de publicidade no jornal impresso, conforme formato e período identificados acima. Definir na versão jurídica aprovada os prazos de entrega e aprovação da arte, especificações técnicas, responsabilidade pelo conteúdo, alterações e cancelamento.",
  ledText: "Objeto: veiculação publicitária no(s) painel(is) LED indicado(s). Especificar antes do envio local de exibição, quantidade de inserções, duração de cada peça, dias e horários, material técnico, início, término, indisponibilidade e reposição de exibições.",
  mixedText: "Objeto: serviços discriminados neste documento, compondo uma contratação conjunta. Especificar preços e prazos de cada serviço, condições de alteração e cancelamento parcial e regras de descontos combinados.",
};

export const CONTRACT_TEMPLATE_LABELS: Record<ContractTemplateKind, string> = {
  annual_print: "Assinatura anual do jornal impresso",
  print_ad: "Publicidade no jornal impresso",
  led_ad: "Divulgação em painel LED",
  mixed: "Contrato combinado de serviços",
};

export const CONTRACT_TEMPLATE_VERSIONS: Record<ContractTemplateKind, string> = {
  annual_print: "annual_print_subscription_draft_v1",
  print_ad: "print_advertising_draft_v1",
  led_ad: "led_advertising_draft_v1",
  mixed: "mixed_services_draft_v1",
};

export function normalizeContractSettings(raw: Record<string, unknown> | null | undefined): ContractSettings {
  if (!raw) return { ...DRAFT_CONTRACT_SETTINGS };
  const fields: Record<keyof ContractSettings, string> = {
    legalName: "legal_name", tradeName: "trade_name", cnpj: "cnpj",
    representative: "representative", address: "address", phone: "phone",
    email: "email", annualText: "annual_text", printText: "print_text",
    ledText: "led_text", mixedText: "mixed_text",
  };
  const values = { ...DRAFT_CONTRACT_SETTINGS };
  (Object.keys(fields) as Array<keyof ContractSettings>).forEach((key) => {
    if (typeof raw[fields[key]] === "string") values[key] = String(raw[fields[key]]);
  });
  return values;
}

export function legalText(settings: ContractSettings, kind: ContractTemplateKind): string {
  return {
    annual_print: settings.annualText,
    print_ad: settings.printText,
    led_ad: settings.ledText,
    mixed: settings.mixedText,
  }[kind];
}

export function formatContractMoney(amount: number | null | undefined): string {
  return typeof amount === "number" && Number.isFinite(amount)
    ? amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "A definir";
}

export function formatContractDate(iso?: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "A definir";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return day + "/" + month + "/" + year;
}

export function identifyContractKind(channel: string): ContractTemplateKind {
  const normalized = channel.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/led|painel|tel[aã]o/.test(normalized)) return "led_ad";
  if (/impresso|jornal|pagina|anuncio/.test(normalized)) return "print_ad";
  return "mixed";
}
