/**
 * Sinaliza texto potencialmente corrompido por mapeamento de fonte ruim
 * (comum em PDFs com fontes incorporadas sem ToUnicode): caractere de
 * substituição Unicode ou caracteres de controle inesperados no meio do
 * texto. Não corrige nada — apenas avisa.
 */
export function findSuspiciousCharacters(text: string): string[] {
  const found = new Set<string>();
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "�") {
      found.add("caractere de substituição (�)");
    } else if (code < 0x09 || (code > 0x0d && code < 0x20)) {
      found.add("caractere de controle inesperado");
    }
  }
  return Array.from(found);
}
