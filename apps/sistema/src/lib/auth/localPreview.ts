/**
 * Bypass de Auth SOMENTE para visualização local do painel, com o Supabase
 * real indisponível. As duas condições abaixo precisam ser verdadeiras —
 * fora disso (qualquer build de produção, ou dev sem a flag), este módulo
 * sempre resolve para `false` e a Auth real continua exatamente como era.
 *
 * Nunca importar isto a partir de um Client Component para decidir o
 * bypass — a decisão fica nos Server Components/middleware, que são os
 * únicos lugares onde `SYSTEM_LOCAL_PREVIEW` (variável não-pública) existe.
 */
export function isLocalPreviewEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.SYSTEM_LOCAL_PREVIEW === "1";
}

export const LOCAL_PREVIEW_PROFILE = {
  id: "00000000-0000-0000-0000-000000000000",
  name: "Visualização Local",
  email: "preview@local.dev",
  role: "owner" as const,
  active: true,
  createdAt: new Date(0).toISOString()
};
