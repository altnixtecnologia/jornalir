import type { DanfseData } from "@ir/core/src/nfse/danfse-data";

/**
 * Dados 100% ficticios, sem conexão com banco, certificado, SEFIN, R2 ou clientes reais.
 * Reutilizados na prévia administrativa e no artefato de CI.
 * PROIBIDO usar como NFS-e emitida, arquivar ou transmitir.
 */
export const DANFSE_PREVIEW_FIXTURE: DanfseData = {
  accessKey: "1".repeat(50),
  nfseNumber: "000012",
  competencyDate: "2026-10-01",
  nfseIssuedAt: "2026-10-25T12:30:45-03:00",
  serviceValue: 150.5,
  dpsNumber: "42",
  dpsSeries: "1",
  dpsIssuedAt: "2026-10-25T12:28:00-03:00",
  emitterMunicipality: "São João do Sul",
  statusCode: "100",
  statusLabel: "NFS-e Gerada",
  issuerLabel: "Prestador",
  purposeLabel: "NFS-e regular",
  isHomologation: true,
  prestador: {
    federalInscription: "00000000000000",
    municipalRegistration: "00000",
    name: "PRESTADOR FICTÍCIO PARA TESTE DE DIAGRAMAÇÃO",
    address: "Rua de Teste, número 100, Bairro Central",
    state: "SC",
    ibgeCode: "4216404",
    zipCode: "00000000",
    phone: "0000000000",
    email: "prestador@example.test",
  },
  tomador: {
    federalInscription: "00000000000",
    name: "CLIENTE FICTÍCIO PARA INSPEÇÃO VISUAL",
    address: "Avenida Fictícia, número 123, complemento fictício",
    state: "SC",
    ibgeCode: "4216404",
    zipCode: "00000000",
    phone: "0000000000",
    email: "tomador@example.test",
  },
  serviceDescription: "Documento sintético: teste de descrição extensa para verificar sobreposição entre colunas e blocos no DANFSe. Não corresponde a nenhum serviço prestado ou nota autorizada.",
  nationalServiceCode: "140619",
  serviceLocationIbgeCode: "4216404",
  issqnTaxBase: "150.50",
  issqnRateApplied: "2.00",
  issqnAmount: "3.01",
  totalRetained: "0.00",
  netValue: "150.50",
};
