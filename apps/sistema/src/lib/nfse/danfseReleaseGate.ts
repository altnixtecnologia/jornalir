/**
 * Trava independente para o DANFSe de produção, conforme revisão do Anexo I
 * da NT 008/2026 v1.02 em 14/11/2026.
 *
 * O gerador atual é um protótipo de homologação: faltam blocos fiscais,
 * modelo geométrico oficial, fontes e campos derivados do XML. Alterar esta
 * constante exige revisão do layout, teste visual e autorização explícita.
 * NÃO permitir bypass por variável de ambiente.
 */
export const DANFSE_OFFICIAL_LAYOUT_APPROVED: boolean = false;

export class DanfseOfficialLayoutNotApprovedError extends Error {
  constructor() {
    super("DANFSe de produção ainda não homologado contra a NT 008/2026 v1.02; download e envio do documento ficam bloqueados.");
    this.name = "DanfseOfficialLayoutNotApprovedError";
  }
}

/** Protótipo marcado como sem validade jurídica é permitido só para homologação visual. */
export function assertDanfseLayoutApproved(isHomologation: boolean): void {
  if (!isHomologation && !DANFSE_OFFICIAL_LAYOUT_APPROVED) {
    throw new DanfseOfficialLayoutNotApprovedError();
  }
}
