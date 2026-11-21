/** Metadado no extra_data já existente: nenhum schema paralelo e nenhuma migração. */
export function isExternallyDraftedInstitutionalContract(
  contract: { extraData?: Record<string, unknown> | null },
): boolean {
  return contract.extraData?.externallyDrafted === true;
}

/** Não apagar metadados de composição/serviços ao editar o contrato. */
export function withInstitutionalDocumentOrigin(
  previous: Record<string, unknown> | null | undefined,
  externallyDrafted: boolean,
): Record<string, unknown> {
  return { ...(previous ?? {}), externallyDrafted: externallyDrafted === true };
}
