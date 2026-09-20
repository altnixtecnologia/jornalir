import type { AuditContext } from "@ir/types";

/** Identidade simulada: não há autenticação real nesta fase (ver docs/ARCHITECTURE.md). */
export const SIMULATED_AUDIT: AuditContext = {
  actorId: "editor-sistema",
  actorRole: "editorial",
};
