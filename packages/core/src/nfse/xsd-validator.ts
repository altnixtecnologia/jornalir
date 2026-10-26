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
 * `./xsd/prodrest-v1.01-20261020/` (ver README.md lá — origem, versão,
 * checksum; o pacote anterior `prodrest-v1.01-20260727/` foi preservado
 * para histórico auditável, mas não é mais o validado em runtime).
 * `DPS_v1.01.xsd` é o esquema raiz pra validar uma DPS;
 * todos os demais arquivos do pacote são pré-carregados (`preload`)
 * pra resolver os `xs:import`/`xs:include` internos (ex.:
 * `xmldsig-core-schema.xsd`, `tiposComplexos_v1.01.xsd`).
 */

const XSD_DIR = join(dirname(fileURLToPath(import.meta.url)), "xsd", "prodrest-v1.01-20261020");
const ROOT_SCHEMA_FILE = "DPS_v1.01.xsd";
/** Esquema raiz do pedido de registro de evento (cancelamento e101101 inclusos) — mesmo pacote vendorizado da DPS. */
const EVENT_ROOT_SCHEMA_FILE = "pedRegEvento_v1.01.xsd";

export interface XsdValidationResult {
  valid: boolean;
  errors: string[];
}

function loadSchemaFiles(rootSchemaFile: string): { schema: { fileName: string; contents: string }; preload: { fileName: string; contents: string }[] } {
  const fileNames = readdirSync(XSD_DIR).filter((name) => name.endsWith(".xsd"));
  const files = fileNames.map((fileName) => ({ fileName, contents: readFileSync(join(XSD_DIR, fileName), "utf8") }));
  const schema = files.find((file) => file.fileName === rootSchemaFile);
  if (!schema) throw new Error(`Esquema raiz ${rootSchemaFile} não encontrado em ${XSD_DIR} — pacote XSD vendorizado incompleto/corrompido.`);
  return { schema, preload: files };
}

async function validateAgainstSchema(xml: string, fileName: string, rootSchemaFile: string): Promise<XsdValidationResult> {
  const { schema, preload } = loadSchemaFiles(rootSchemaFile);
  const result = await validateXML({
    xml: { fileName, contents: xml },
    schema: { fileName: schema.fileName, contents: schema.contents },
    preload: preload.filter((file) => file.fileName !== schema.fileName),
  });
  return {
    valid: result.valid,
    errors: result.errors.map((error) => error.message),
  };
}

/**
 * Valida o XML (assinado ou não) da DPS contra o XSD oficial de
 * Produção Restrita. NUNCA finge sucesso se o validador não conseguir
 * resolver os imports/includes do pacote — qualquer erro do xmllint
 * (incluindo falha de resolução de schema) aparece em `errors`, nunca
 * é engolido silenciosamente.
 */
export async function validateDpsAgainstOfficialXsd(xml: string): Promise<XsdValidationResult> {
  return validateAgainstSchema(xml, "dps.xml", ROOT_SCHEMA_FILE);
}

/**
 * Valida o XML (assinado ou não) do pedido de registro de evento
 * (ex.: cancelamento e101101) contra `pedRegEvento_v1.01.xsd` do mesmo
 * pacote vendorizado — mesmo princípio de `validateDpsAgainstOfficialXsd`,
 * nunca finge sucesso em erro de resolução de schema.
 */
export async function validatePedRegEventoAgainstOfficialXsd(xml: string): Promise<XsdValidationResult> {
  return validateAgainstSchema(xml, "pedRegEvento.xml", EVENT_ROOT_SCHEMA_FILE);
}
