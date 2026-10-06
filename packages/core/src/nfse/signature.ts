import { createHash, createSign } from "node:crypto";

/**
 * Assinatura XML da DPS (Parte 2A, item 8) — ESTRITAMENTE server-side,
 * nunca expõe a chave privada.
 *
 * STATUS (ajuste de segurança pós-revisão): o algoritmo/canonicalização
 * EXATOS exigidos pelo Sistema Nacional NÃO foram confirmados contra
 * uma fonte oficial vigente de forma conclusiva. Pesquisa feita:
 * - O ANEXO_I-SEFIN_ADN-DPS_NFSe-SNNFSe vigente (v1.01-20260209,
 *   gov.br/nfse/.../documentacao-atual) é uma planilha de LAYOUT DE
 *   CAMPOS — não especifica algoritmo de assinatura XML.
 * - O "Manual dos Municípios/Contribuintes" vigente (gov.br/nfse,
 *   .../documentacao-atual, versão "out2025"/v1.2) não pôde ser lido
 *   de forma confiável com as ferramentas disponíveis nesta sessão
 *   (PDF com texto comprimido/não extraível).
 * - Fontes secundárias do ecossistema (integradores open-source,
 *   issues de projetos como erpbrasil.assinatura, OpenAC.Net.NFSe.Nacional)
 *   DIVERGEM entre si: alguns usam RSA-SHA256, outros mantêm RSA-SHA1
 *   (padrão legado de NF-e/CT-e/MDF-e). Existe até uma ferramenta
 *   dedicada ("nfse-doctor") só para detectar empiricamente, contra o
 *   servidor real, qual perfil de assinatura é aceito — evidência de
 *   que isso não está claramente resolvido nem para quem já integrou.
 *
 * Por isso, SEGUINDO A REGRA EXPLÍCITA desta fase ("se não for possível
 * comprovar com fonte oficial, bloquear e deixar pendente, sem
 * adivinhar"): este módulo continua funcionalmente capaz de assinar
 * (útil para testar o resto do fluxo de transmissão com chaves de
 * teste), mas NUNCA afirma que RSA-SHA1 ou RSA-SHA256 é o algoritmo
 * correto — o chamador precisa informar explicitamente qual quer usar
 * (`signatureAlgorithm`), e a transmissão REAL contra a API Nacional
 * permanece bloqueada em outro ponto (ver `RealTransmissionNotReadyError`
 * em national-nfse-provider.ts) até essa confirmação existir.
 *
 * Canonicalização: mesma ressalva — implementada de forma SIMPLIFICADA
 * (só remove espaço insignificante entre tags do nosso builder
 * determinístico), nunca uma implementação genérica de C14N/exc-C14N,
 * e nunca declarada como conforme ao padrão oficial.
 */

export type DpsSignatureAlgorithm = "rsa-sha1" | "rsa-sha256";

const SIGNATURE_METHOD_URIS: Record<DpsSignatureAlgorithm, string> = {
  "rsa-sha1": "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
  "rsa-sha256": "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
};
const DIGEST_METHOD_URIS: Record<DpsSignatureAlgorithm, string> = {
  "rsa-sha1": "http://www.w3.org/2000/09/xmldsig#sha1",
  "rsa-sha256": "http://www.w3.org/2001/04/xmlenc#sha256",
};
const NODE_SIGN_ALGORITHM: Record<DpsSignatureAlgorithm, string> = {
  "rsa-sha1": "RSA-SHA1",
  "rsa-sha256": "RSA-SHA256",
};
const NODE_DIGEST_ALGORITHM: Record<DpsSignatureAlgorithm, string> = {
  "rsa-sha1": "sha1",
  "rsa-sha256": "sha256",
};

/** Canonicalização simplificada — só remove espaço insignificante entre
 * tags. Documentado como provisório (ver comentário do módulo). */
function simplifiedCanonicalize(xml: string): string {
  return xml.replace(/>\s+</g, "><").trim();
}

export interface DpsSigningInput {
  xml: string;
  /** Já extraída do PFX (ver certificate-provider.ts) — nunca o PFX bruto aqui. */
  privateKeyPem: string;
  certificatePem: string;
  /** Escolha EXPLÍCITA do chamador — este módulo nunca assume um default, porque o algoritmo oficial não está confirmado (ver comentário do módulo). */
  signatureAlgorithm: DpsSignatureAlgorithm;
}

export interface DpsSigningResult {
  signedXml: string;
  digestValue: string;
  signatureValue: string;
  signatureAlgorithm: string;
  digestAlgorithm: string;
}

/**
 * Assina a DPS com o algoritmo EXPLICITAMENTE informado (nunca um
 * default assumido) sobre a forma canonicalizada (simplificada, ver
 * aviso do módulo) do XML. Nunca loga/retorna a chave privada; o
 * retorno só tem o XML assinado e os valores públicos de digest/
 * assinatura.
 */
export function signDpsXml(input: DpsSigningInput): DpsSigningResult {
  const canonical = simplifiedCanonicalize(input.xml);
  const digestValue = createHash(NODE_DIGEST_ALGORITHM[input.signatureAlgorithm]).update(canonical, "utf8").digest("base64");

  const sign = createSign(NODE_SIGN_ALGORITHM[input.signatureAlgorithm]);
  sign.update(canonical, "utf8");
  sign.end();
  const signatureValue = sign.sign(input.privateKeyPem, "base64");

  const signatureMethod = SIGNATURE_METHOD_URIS[input.signatureAlgorithm];
  const digestMethod = DIGEST_METHOD_URIS[input.signatureAlgorithm];

  const signatureBlock =
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<SignedInfo>` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<SignatureMethod Algorithm="${signatureMethod}"/>` +
    `<Reference URI="">` +
    `<DigestMethod Algorithm="${digestMethod}"/>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>` +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${input.certificatePem.replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, "")}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`;

  const signedXml = input.xml.replace("</DPS>", `${signatureBlock}</DPS>`);

  return { signedXml, digestValue, signatureValue, signatureAlgorithm: signatureMethod, digestAlgorithm: digestMethod };
}
