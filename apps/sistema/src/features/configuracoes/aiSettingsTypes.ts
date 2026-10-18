/** Tipos compartilhados da configuracao do Assistente IR (sem segredos). */
export type AiProvider = "openai" | "anthropic";
export type AiModuleMode = "off" | "assistido" | "autonomo";
export type AiModuleKey =
  | "financeiro" | "clientes" | "site" | "editorial"
  | "agenda" | "aniversariantes" | "contratos" | "fiscal";

export const AI_MODULES: ReadonlyArray<{ key: AiModuleKey; label: string; description: string }> = [
  { key: "financeiro", label: "Financeiro", description: "Pagamentos, cobrancas e atrasos" },
  { key: "clientes", label: "Clientes", description: "Cadastros e solicitacoes" },
  { key: "site", label: "Pedidos do site", description: "Assinaturas, publicidade e contatos" },
  { key: "editorial", label: "Editorial", description: "PDFs, noticias e revisoes" },
  { key: "agenda", label: "Agenda", description: "Compromissos e lembretes" },
  { key: "aniversariantes", label: "Aniversariantes", description: "Homenagens individuais" },
  { key: "contratos", label: "Contratos", description: "Documentos e conferencias" },
  { key: "fiscal", label: "Fiscal / NFS-e", description: "Conferencias fiscais" },
];

export const DEFAULT_AI_MODULE_MODES: Record<AiModuleKey, AiModuleMode> = {
  financeiro: "off", clientes: "off", site: "off", editorial: "off",
  agenda: "off", aniversariantes: "off", contratos: "off", fiscal: "off",
};

export interface AiSettingsInput {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  modes: Record<AiModuleKey, AiModuleMode>;
}

export interface AiSettingsSnapshot extends AiSettingsInput {
  configuredKeys: Record<AiProvider, boolean>;
  encryptionAvailable: boolean;
  backendAvailable: boolean;
  pendingApprovals: number;
}

export const AI_DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5",
};

export function readAiModes(value: unknown): Record<AiModuleKey, AiModuleMode> {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const result = { ...DEFAULT_AI_MODULE_MODES };
  for (const item of AI_MODULES) {
    const mode = source[item.key];
    if (mode === "assistido" || mode === "autonomo") result[item.key] = mode;
  }
  return result;
}

export function validAiMode(value: unknown): value is AiModuleMode {
  return value === "off" || value === "assistido" || value === "autonomo";
}
