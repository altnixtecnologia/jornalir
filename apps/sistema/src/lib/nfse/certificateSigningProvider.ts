import "server-only";
import { extractKeyMaterialFromPfx, isCertificateConfigured, loadCertificateFromEnv } from "@ir/core";
// Caminho direto — ver comentário em packages/core/src/nfse/index.ts.
import type { CertificateSigningProvider } from "@ir/core/src/nfse/transmission-service";

/**
 * Implementação real do `CertificateSigningProvider` (Parte 2A, item 4)
 * — lê o certificado SÓ de variável de ambiente do servidor
 * (`NFSE_CERTIFICATE_PFX_BASE64`/`NFSE_CERTIFICATE_PASSPHRASE`), nunca
 * do banco, nunca do browser. `getSigningKeyMaterial()` delega pra
 * `extractKeyMaterialFromPfx`, que hoje lança erro claro — a extração
 * de chave privada de PKCS#12 ainda não foi implementada (ver
 * certificate-provider.ts em @ir/core) porque exige uma dependência de
 * parsing PKCS#12 que ainda não existe no projeto. Quando essa
 * dependência for adicionada e a função implementada, nada aqui
 * precisa mudar.
 */
export function createServerCertificateSigningProvider(): CertificateSigningProvider {
  return {
    isConfigured: isCertificateConfigured,
    getSigningKeyMaterial() {
      const material = loadCertificateFromEnv();
      if (!material) throw new Error("Certificado não configurado.");
      return extractKeyMaterialFromPfx(material);
    },
  };
}
