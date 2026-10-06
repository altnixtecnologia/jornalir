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
export * from "./national-nfse-provider";
export * from "./readiness";

// NÃO reexportados aqui de propósito — todos (direta ou
// transitivamente) usam dependências Node-only (`node:crypto`,
// `node-forge`, `xml-crypto`, `xmllint-wasm`, `undici`) que não podem
// entrar no bundle de componentes "use client" (ex.: NfseDraftForm,
// que só precisa de validateNfseDraft via este mesmo barrel). Quem
// precisar importa direto do caminho profundo
// "@ir/core/src/nfse/<arquivo>" — sempre de código estritamente
// server-side (composition/actions, nunca de um componente cliente):
// signature.ts, transmission-service.ts, certificate-service.ts,
// certificate-repository.ts, pfx-parser.ts, secret-store.ts,
// xsd-validator.ts, mutual-tls.ts.
