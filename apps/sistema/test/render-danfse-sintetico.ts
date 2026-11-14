/**
 * PDF exclusivamente sintético, para inspeção visual na PR. Não acessa banco, SEFIN, R2 nem e-mail.
 * A marca "NFS-e SEM VALIDADE JURÍDICA" é aplicada pelo gerador de homologação.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { buildDanfsePdf } from "../src/lib/nfse/danfsePdf";
import type { DanfseData } from "@ir/core/src/nfse/danfse-data";

const fixture: DanfseData = {
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

const path = "artifacts/danfse-homologacao-ficticio.pdf";
mkdirSync("artifacts", { recursive: true });
const bytes = await buildDanfsePdf(fixture);
writeFileSync(path, Buffer.from(bytes));
console.log("PDF sintético criado para inspeção. Sem qualquer integração fiscal ou dado real.");
