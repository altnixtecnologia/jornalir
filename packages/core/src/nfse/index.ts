export * from "./issuer-config-repository";
export * from "./issuer-config-service";
export * from "./service-profile-repository";
export * from "./service-profile-service";
export * from "./draft-repository";
export * from "./draft-service";
export * from "./dps-sequence-repository";
export * from "./issued-note-repository";
export * from "./transmission-attempt-repository";
export * from "./dps-builder";
export * from "./certificate-provider";
export * from "./national-nfse-provider";

// `signature.ts`/`transmission-service.ts` NÃO são reexportados aqui
// de propósito — ambos (direta ou transitivamente) usam `node:crypto`,
// que não pode entrar no bundle de componentes "use client" (ex.:
// NfseDraftForm, que só precisa de validateNfseDraft via este mesmo
// barrel). Quem precisar de TransmissionService/signDpsXml importa
// direto de "@ir/core/src/nfse/transmission-service" /
// "@ir/core/src/nfse/signature" — sempre de código estritamente
// server-side (composition/actions, nunca de um componente cliente).
