/**
 * PDF exclusivamente sintético, para inspeção visual na PR. Não acessa banco, SEFIN, R2 nem e-mail.
 * A marca "NFS-e SEM VALIDADE JURÍDICA" é aplicada pelo gerador de homologação.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { buildDanfsePdf } from "../src/lib/nfse/danfsePdf";
import { DANFSE_PREVIEW_FIXTURE } from "../src/lib/nfse/danfsePreviewFixture";

async function main(): Promise<void> {
  const path = "artifacts/danfse-homologacao-ficticio.pdf";
  mkdirSync("artifacts", { recursive: true });
  const bytes = await buildDanfsePdf(DANFSE_PREVIEW_FIXTURE);
  writeFileSync(path, Buffer.from(bytes));
  console.log("PDF sintético criado para inspeção. Sem qualquer integração fiscal ou dado real.");
}

void main().catch((error: unknown) => {
  console.error("Falha na geração do PDF sintético:", error);
  process.exitCode = 1;
});
