/**
 * Primitivas de serialização XML (Parte 2C, item 9 — "separar
 * serializer do mapper/modelo de domínio") — usadas só por
 * dps-builder.ts. Nenhuma regra fiscal aqui, só escape/montagem de tag.
 */

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Omite a tag inteira quando o valor é `undefined`/vazio — nunca emite tag opcional vazia sem necessidade (item 9). */
export function tag(name: string, value: string | number | undefined): string {
  if (value === undefined || value === "") return "";
  return `<${name}>${escapeXml(String(value))}</${name}>`;
}
