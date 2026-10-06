import { SignedXml } from "xml-crypto";

/**
 * Assinatura XML da DPS (Parte 2A, item 8 → Parte 2B, item "Assinatura
 * oficial") — ESTRITAMENTE server-side, nunca expõe a chave privada.
 *
 * STATUS: perfil CONFIRMADO contra fonte oficial do Portal Nacional da
 * NFS-e para a assinatura da DPS:
 * - XML Digital Signature, formato Enveloped;
 * - assina o elemento `infDPS` (referenciado pelo seu atributo `Id`,
 *   URI = "#" + Id);
 * - Canonicalization: http://www.w3.org/TR/2001/REC-xml-c14n-20010315;
 * - SignatureMethod: http://www.w3.org/2000/09/xmldsig#rsa-sha1;
 * - DigestMethod: http://www.w3.org/2000/09/xmldsig#sha1;
 * - Transforms: enveloped-signature + C14N (nesta ordem);
 * - KeyInfo/X509Data/X509Certificate — SÓ o certificado final
 *   (EndCertOnly), sem RSAKeyValue/Modulus/Exponent nem cadeia
 *   completa.
 *
 * Corroborado estruturalmente contra o XSD oficial vigente de Produção
 * Restrita (`TCDPS` em `xsd/prodrest-v1.01-20260727/tiposComplexos_v1.01.xsd`
 * — ver `../xsd/prodrest-v1.01-20260727/README.md`): `infDPS` (com
 * atributo `Id` obrigatório) seguido de `ds:Signature`, dentro de `DPS`.
 *
 * O perfil fica isolado em `NFSE_DPS_SIGNATURE_PROFILE` abaixo —
 * qualquer mudança futura de especificação (nota técnica oficial)
 * altera só esta constante, nunca precisa reescrever a função.
 *
 * Implementação usa `xml-crypto` (pure JS, sem dependência nativa) em
 * vez de uma canonicalização/montagem manual do bloco `<Signature>` —
 * C14N real (não a aproximação "remover espaço insignificante" usada
 * antes da confirmação oficial), enveloped-signature real, e o atributo
 * `Id` já existente no `infDPS` (ver dps-builder.ts/buildDpsId) é
 * reaproveitado como referência — nunca gerado de novo.
 */

export const NFSE_DPS_SIGNATURE_PROFILE = {
  signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
  digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
  canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"],
} as const;

const INF_DPS_XPATH = "//*[local-name(.)='infDPS']";

export interface DpsSigningInput {
  xml: string;
  /** Já extraída do PFX (ver certificate-service.ts) — nunca o PFX bruto aqui. */
  privateKeyPem: string;
  certificatePem: string;
}

export interface DpsSigningResult {
  signedXml: string;
  signatureAlgorithm: string;
  digestAlgorithm: string;
}

/**
 * Assina a DPS com o perfil oficial fixo (`NFSE_DPS_SIGNATURE_PROFILE`)
 * — enveloped, referenciando `infDPS` pelo `Id` já presente no XML.
 * Nunca loga/retorna a chave privada; o retorno só tem o XML assinado e
 * os identificadores (públicos) de algoritmo usados.
 */
export function signDpsXml(input: DpsSigningInput): DpsSigningResult {
  const sig = new SignedXml({
    privateKey: input.privateKeyPem,
    publicCert: input.certificatePem,
    signatureAlgorithm: NFSE_DPS_SIGNATURE_PROFILE.signatureAlgorithm,
    canonicalizationAlgorithm: NFSE_DPS_SIGNATURE_PROFILE.canonicalizationAlgorithm,
  });

  sig.addReference({
    xpath: INF_DPS_XPATH,
    transforms: [...NFSE_DPS_SIGNATURE_PROFILE.transforms],
    digestAlgorithm: NFSE_DPS_SIGNATURE_PROFILE.digestAlgorithm,
  });

  sig.computeSignature(input.xml, {
    location: { reference: INF_DPS_XPATH, action: "after" },
  });

  return {
    signedXml: sig.getSignedXml(),
    signatureAlgorithm: NFSE_DPS_SIGNATURE_PROFILE.signatureAlgorithm,
    digestAlgorithm: NFSE_DPS_SIGNATURE_PROFILE.digestAlgorithm,
  };
}
