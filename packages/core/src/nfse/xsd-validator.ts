import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateXML } from "xmllint-wasm";

/**
 * Validação XSD REAL (Parte 2B, item "XSD real") — ESTA é a validação
 * que pode ser chamada de "validação XSD"; `validateDpsXmlStructure`
 * (dps-builder.ts) continua sendo só validação estrutural interna,
 * nunca confundida com esta.
 *
 * Biblioteca: `xmllint-wasm` (WebAssembly do libxml2) — pure
 * JS+WASM, sem `xmllint`/Java/dependência nativa instalada no
 * servidor, compatível com Node/Vercel.
 *
 * Esquema: pacote oficial vendorizado em
 * `./xsd/prodrest-v1.01-20260727/` (ver README.md lá — origem, versão,
 * checksum). `DPS_v1.01.xsd` é o esquema raiz pra validar uma DPS;
 * todos os demais arquivos do pacote são pré-carregados (`preload`)
 * pra resolver os `xs:import`/`xs:include` internos (ex.:
 * `xmldsig-core-schema.xsd`, `tiposComplexos_v1.01.xsd`).
 */

const XSD_DIR = join(dirname(fileURLToPath(import.meta.url)), "xsd", "prodrest-v1.01-20260727");
const ROOT_SCHEMA_FILE = "DPS_v1.01.xsd";

export interface XsdValidationResult {
  valid: boolean;
  errors: string[];
}

function loadSchemaFiles(): { schema: { fileName: string; contents: string }; preload: { fileName: string; contents: string }[] } {
  const fileNames = readdirSync(XSD_DIR).filter((name) => name.endsWith(".xsd"));
  const files = fileNames.map((fileName) => ({ fileName, contents: readFileSync(join(XSD_DIR, fileName), "utf8") }));
  const schema = files.find((file) => file.fileName === ROOT_SCHEMA_FILE);
  if (!schema) throw new Error(`Esquema raiz ${ROOT_SCHEMA_FILE} não encontrado em ${XSD_DIR} — pacote XSD vendorizado incompleto/corrompido.`);
  return { schema, preload: files };
}

/**
 * Valida o XML (assinado ou não) da DPS contra o XSD oficial de
 * Produção Restrita. NUNCA finge sucesso se o validador não conseguir
 * resolver os imports/includes do pacote — qualquer erro do xmllint
 * (incluindo falha de resolução de schema) aparece em `errors`, nunca
 * é engolido silenciosamente.
 */
export async function validateDpsAgainstOfficialXsd(xml: string): Promise<XsdValidationResult> {
  const { schema, preload } = loadSchemaFiles();
  const result = await validateXML({
    xml: { fileName: "dps.xml", contents: xml },
    schema: { fileName: schema.fileName, contents: schema.contents },
    preload: preload.filter((file) => file.fileName !== schema.fileName),
  });
  return {
    valid: result.valid,
    errors: result.errors.map((error) => error.message),
  };
}
